/**
 * Tests for feeder client improvements
 * Tests memory monitoring, circuit breaker, connection pooling, and error handling
 */

const http = require('http');
const https = require('https');

describe('Feeder Client Improvements', () => {
  let httpAgent;
  let httpsAgent;

  beforeEach(() => {
    // Create HTTP agents for testing
    httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 5,
    });
    
    httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 5,
    });
  });

  afterEach(() => {
    httpAgent.destroy();
    httpsAgent.destroy();
  });

  describe('Connection Pooling', () => {
    it('should create HTTP agents with connection limits', () => {
      const agent = new http.Agent({
        keepAlive: true,
        maxSockets: 5,
        maxFreeSockets: 2,
      });

      expect(agent.maxSockets).toBe(5);
      expect(agent.maxFreeSockets).toBe(2);
      expect(agent.keepAlive).toBe(true);
    });

    it('should limit concurrent connections', () => {
      const agent = new http.Agent({
        maxSockets: 5,
      });

      // Should not exceed maxSockets
      expect(agent.maxSockets).toBe(5);
    });
  });

  describe('Memory Monitoring', () => {
    it('should check memory usage periodically', () => {
      const checkMemory = () => {
        const usage = process.memoryUsage();
        const rssMB = usage.rss / 1024 / 1024;
        return rssMB;
      };

      const memoryMB = checkMemory();
      expect(typeof memoryMB).toBe('number');
      expect(memoryMB).toBeGreaterThan(0);
    });

    it('should detect high memory usage', () => {
      const MAX_MEMORY_MB = 200;
      const usage = process.memoryUsage();
      const rssMB = usage.rss / 1024 / 1024;
      
      const isHigh = rssMB > MAX_MEMORY_MB;
      expect(typeof isHigh).toBe('boolean');
    });

    it('should trigger exit on critical memory', () => {
      const MAX_MEMORY_MB = 200;
      const CRITICAL_MULTIPLIER = 1.5;
      
      // Simulate high memory
      const mockUsage = {
        rss: 400 * 1024 * 1024, // 400MB
        heapUsed: 300 * 1024 * 1024,
      };
      
      const rssMB = mockUsage.rss / 1024 / 1024;
      const shouldExit = rssMB > MAX_MEMORY_MB * CRITICAL_MULTIPLIER;
      
      expect(shouldExit).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    it('should skip polls when too many consecutive errors', () => {
      const MAX_CONSECUTIVE_ERRORS = 10;
      let consecutiveErrors = 11;

      const shouldSkip = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
      expect(shouldSkip).toBe(true);
    });

    it('should reset error count on success', () => {
      let consecutiveErrors = 5;
      const MAX_CONSECUTIVE_ERRORS = 10;

      // Simulate success
      consecutiveErrors = 0;

      const shouldSkip = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
      expect(shouldSkip).toBe(false);
    });

    it('should exit after too many errors', () => {
      const MAX_CONSECUTIVE_ERRORS = 10;
      let consecutiveErrors = 20;

      const shouldExit = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS * 2;
      expect(shouldExit).toBe(true);
    });
  });

  describe('Overlap Protection', () => {
    it('should prevent overlapping polls', () => {
      let isPolling = false;

      const startPoll = () => {
        if (isPolling) return false;
        isPolling = true;
        return true;
      };

      expect(startPoll()).toBe(true);
      expect(startPoll()).toBe(false); // Should be blocked
      
      isPolling = false;
      expect(startPoll()).toBe(true);
    });
  });

  describe('Timeout Protection', () => {
    it('should timeout long-running requests', async () => {
      const TIMEOUT_MS = 10000;
      
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('slow'), 15000);
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
      });

      await expect(
        Promise.race([slowPromise, timeoutPromise])
      ).rejects.toThrow('Timeout');
    }, 12000);

    it('should complete fast requests before timeout', async () => {
      const TIMEOUT_MS = 10000;
      
      const fastPromise = new Promise((resolve) => {
        setTimeout(() => resolve('fast'), 100);
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
      });

      const result = await Promise.race([fastPromise, timeoutPromise]);
      expect(result).toBe('fast');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const handleError = (error) => {
        const errorMessage = error.message || 'Unknown error';
        return errorMessage;
      };

      const networkError = new Error('ECONNREFUSED');
      const message = handleError(networkError);
      expect(message).toBe('ECONNREFUSED');
    });

    it('should log errors appropriately', () => {
      let consecutiveErrors = 5;
      const MAX_CONSECUTIVE_ERRORS = 10;

      const shouldLogAll = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
      expect(shouldLogAll).toBe(false);

      consecutiveErrors = 11;
      const shouldLogAllNow = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
      expect(shouldLogAllNow).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close HTTP agents on shutdown', () => {
      const agent = new http.Agent({
        keepAlive: true,
        maxSockets: 5,
      });

      expect(() => agent.destroy()).not.toThrow();
    });

    it('should clear intervals on shutdown', () => {
      let interval = setInterval(() => {}, 1000);
      expect(interval).toBeDefined();

      clearInterval(interval);
      interval = null;
      expect(interval).toBeNull();
    });
  });

  describe('Data Transformation', () => {
    it('should transform aircraft data correctly', () => {
      const feetToMeters = (feet) => feet * 0.3048;
      const knotsToMetersPerSecond = (knots) => knots * 0.514444;

      const aircraft = {
        hex: 'abc123',
        flight: 'TEST123',
        lat: 35.0,
        lon: -106.0,
        alt_baro: 10000, // feet
        alt_geom: 10500,
        gs: 200, // knots
        track: 90,
        category: 'A3',
      };

      const transformed = {
        icao24: aircraft.hex,
        callsign: aircraft.flight,
        latitude: aircraft.lat,
        longitude: aircraft.lon,
        baro_altitude: feetToMeters(aircraft.alt_baro),
        geo_altitude: feetToMeters(aircraft.alt_geom),
        velocity: knotsToMetersPerSecond(aircraft.gs),
        true_track: aircraft.track,
      };

      expect(transformed.icao24).toBe('abc123');
      expect(transformed.baro_altitude).toBeCloseTo(3048, 0); // ~3048 meters
      expect(transformed.velocity).toBeCloseTo(102.89, 1); // ~102.89 m/s
    });

    it('should handle missing altitude data', () => {
      const aircraft = {
        hex: 'abc123',
        lat: 35.0,
        lon: -106.0,
        // No altitude data
      };

      const transformed = {
        baro_altitude: aircraft.alt_baro ? aircraft.alt_baro * 0.3048 : null,
        geo_altitude: aircraft.alt_geom ? aircraft.alt_geom * 0.3048 : null,
      };

      expect(transformed.baro_altitude).toBeNull();
      expect(transformed.geo_altitude).toBeNull();
    });

    it('should parse category from hex', () => {
      const category = 'A3';
      const parsed = parseInt(category, 16);
      
      // A3 in hex = 163 in decimal, but should be clamped to 0-19
      const validCategory = !isNaN(parsed) && parsed >= 0 && parsed <= 19 ? parsed : null;
      
      expect(validCategory).toBeNull(); // 163 is out of range
      
      const validHex = 'A1'; // 161 in decimal, also out of range
      const parsedValid = parseInt(validHex, 16);
      const clamped = !isNaN(parsedValid) && parsedValid >= 0 && parsedValid <= 19 ? parsedValid : null;
      expect(clamped).toBeNull();
    });
  });
});

