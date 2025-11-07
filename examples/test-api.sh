#!/bin/bash

# Test API Script
# This script tests the feeder ingestion service API endpoints

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3006}"
API_KEY="${API_KEY:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "==================================="
echo "Feeder Ingestion Service API Tests"
echo "==================================="
echo ""
echo "API URL: $API_URL"
echo ""

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
response=$(curl -s -w "\n%{http_code}" "$API_URL/health")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$body" | jq '.'
else
    echo -e "${RED}✗ Health check failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Test 2: Root Endpoint
echo -e "${YELLOW}Test 2: Root Endpoint${NC}"
response=$(curl -s -w "\n%{http_code}" "$API_URL/")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Root endpoint accessible${NC}"
    echo "$body" | jq '.'
else
    echo -e "${RED}✗ Root endpoint failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Test 3: Register Feeder (if no API key provided)
if [ -z "$API_KEY" ]; then
    echo -e "${YELLOW}Test 3: Register Feeder${NC}"
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/feeders/register" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test Feeder '$(date +%s)'",
            "location": {
                "latitude": 37.7749,
                "longitude": -122.4194
            },
            "metadata": {
                "hardware": "Test",
                "software": "curl"
            }
        }')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ Feeder registered successfully${NC}"
        echo "$body" | jq '.'
        
        # Extract API key for next tests
        API_KEY=$(echo "$body" | jq -r '.api_key')
        echo ""
        echo -e "${GREEN}Using API key for subsequent tests: ${API_KEY:0:20}...${NC}"
    else
        echo -e "${RED}✗ Feeder registration failed (HTTP $http_code)${NC}"
        echo "$body"
        echo ""
        echo "Skipping authenticated tests (no API key)"
        exit 0
    fi
    echo ""
fi

# Test 4: Submit Data (requires API key)
if [ -n "$API_KEY" ]; then
    echo -e "${YELLOW}Test 4: Submit Aircraft Data${NC}"
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/feeders/data" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "timestamp": '$(date +%s)',
            "states": [
                {
                    "icao24": "abc123",
                    "callsign": "TEST123",
                    "latitude": 37.7749,
                    "longitude": -122.4194,
                    "baro_altitude": 10000.0,
                    "geo_altitude": 10000.0,
                    "velocity": 200.0,
                    "true_track": 90.0,
                    "vertical_rate": 0.0,
                    "squawk": "1200",
                    "on_ground": false,
                    "category": 3,
                    "time_position": '$(date +%s)',
                    "last_contact": '$(date +%s)'
                }
            ]
        }')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ Data submitted successfully${NC}"
        echo "$body" | jq '.'
    else
        echo -e "${RED}✗ Data submission failed (HTTP $http_code)${NC}"
        echo "$body"
    fi
    echo ""
    
    # Test 5: Get Feeder Info
    echo -e "${YELLOW}Test 5: Get Feeder Info${NC}"
    response=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/feeders/me" \
        -H "Authorization: Bearer $API_KEY")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ Feeder info retrieved${NC}"
        echo "$body" | jq '.'
    else
        echo -e "${RED}✗ Failed to get feeder info (HTTP $http_code)${NC}"
        echo "$body"
    fi
    echo ""
    
    # Test 6: Get Stats
    echo -e "${YELLOW}Test 6: Get Feeder Stats${NC}"
    response=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/feeders/me/stats?days=7" \
        -H "Authorization: Bearer $API_KEY")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ Stats retrieved${NC}"
        echo "$body" | jq '.'
    else
        echo -e "${RED}✗ Failed to get stats (HTTP $http_code)${NC}"
        echo "$body"
    fi
    echo ""
fi

echo "==================================="
echo "Tests completed"
echo "==================================="

