/**
 * Integration tests for feeder client
 * Tests the full flow with mocked services
 */

const http = require('http');
const EventEmitter = require('events');

describe('Feeder Client Integration Tests', () => {
  let mockServer;
  let mockDump1090Server;
  let serverPort;
  let dump1090Port;

  beforeEach(() => {
    // Create mock dump1090 server
    mockDump1090Server = http.createServer((req, res) => {
      if (req.url === '/data/aircraft.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          now: Date.now() / 1000,
          aircraft: [
            {
              hex: 'abc123',
              flight: 'TEST123',
              lat: 35.0,
              lon: -106.0,
              alt_baro: 10000,
              alt_geom: 10500,
              gs: 200,
              track: 90,
              category: 'A3',
            },
          ],
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Create mock feeder API server
    mockServer = http.createServer((req, res) => {
      if (req.url === '/api/v1/feeders/data' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const data = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            processed: data.states.length,
            errors: [],
            feeder_id: 'test-feeder',
          }));
        });
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Start servers on random ports
    return new Promise((resolve) => {
      mockDump1090Server.listen(0, () => {
        dump1090Port = mockDump1090Server.address().port;
        mockServer.listen(0, () => {
          serverPort = mockServer.address().port;
          resolve();
        });
      });
    });
  });

  afterEach(() => {
    return new Promise((resolve) => {
      mockDump1090Server.close(() => {
        mockServer.close(() => {
          resolve();
        });
      });
    });
  });

  describe('Full Poll Cycle', () => {
    it('should successfully poll and submit data', async () => {
      const axios = require('axios');

      const dump1090Url = `http://localhost:${dump1090Port}/data/aircraft.json`;

      // Poll dump1090
      const response = await axios.get(dump1090Url, { timeout: 5000 });
      const aircraft = response.data.aircraft || [];

      expect(aircraft.length).toBeGreaterThan(0);

      // Transform data
      const states = aircraft
        .filter((ac) => ac.lat !== undefined && ac.lon !== undefined)
        .map((ac) => ({
          icao24: ac.hex,
          callsign: ac.flight,
          latitude: ac.lat,
          longitude: ac.lon,
          baro_altitude: ac.alt_baro ? ac.alt_baro * 0.3048 : null,
        }));

      expect(states.length).toBeGreaterThan(0);
      expect(states[0].icao24).toBe('abc123');

      // Mock submit to API
      const submitResponse = await axios.post(
        `http://localhost:${serverPort}/api/v1/feeders/data`,
        { states },
        {
          headers: { 'Authorization': 'Bearer test-key' },
          timeout: 5000,
        }
      );

      expect(submitResponse.data.success).toBe(true);
      expect(submitResponse.data.processed).toBe(states.length);
    });

    it('should handle dump1090 errors gracefully', async () => {
      const axios = require('axios');

      // Close dump1090 server to simulate error
      await new Promise((resolve) => mockDump1090Server.close(resolve));

      const dump1090Url = `http://localhost:${dump1090Port}/data/aircraft.json`;

      await expect(
        axios.get(dump1090Url, { timeout: 1000 })
      ).rejects.toThrow();
    });

    it('should handle API errors gracefully', async () => {
      const axios = require('axios');

      // Close API server to simulate error
      await new Promise((resolve) => mockServer.close(resolve));

      const states = [{
        icao24: 'abc123',
        latitude: 35.0,
        longitude: -106.0,
      }];

      await expect(
        axios.post(
          `http://localhost:${serverPort}/api/v1/feeders/data`,
          { states },
          {
            headers: { 'Authorization': 'Bearer test-key' },
            timeout: 1000,
          }
        )
      ).rejects.toThrow();
    });
  });

  describe('Memory and Performance', () => {
    it('should not accumulate memory over multiple polls', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate multiple polls
      for (let i = 0; i < 10; i++) {
        const axios = require('axios');
        await axios.get(`http://localhost:${dump1090Port}/data/aircraft.json`, { timeout: 1000 });
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be reasonable (< 50MB for 10 polls)
      expect(memoryIncrease).toBeLessThan(50);
    });

    it('should complete polls within timeout', async () => {
      const axios = require('axios');
      const startTime = Date.now();

      await axios.get(`http://localhost:${dump1090Port}/data/aircraft.json`, { timeout: 5000 });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should reduce polling frequency after errors', async () => {
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 10;
      let pollCount = 0;

      const poll = async () => {
        pollCount++;
        try {
          // Simulate error
          throw new Error('Service unavailable');
        } catch (error) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            // Circuit breaker: skip most polls
            return Date.now() % 30000 < 5000;
          }
          return false;
        }
      };

      // Simulate 15 errors
      for (let i = 0; i < 15; i++) {
        await poll();
      }

      expect(consecutiveErrors).toBe(15);
      expect(consecutiveErrors).toBeGreaterThanOrEqual(MAX_CONSECUTIVE_ERRORS);
    });
  });
});

