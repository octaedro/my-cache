#!/bin/bash

# Test script for homework requirements
# Tests basic add, fetch, and remove operations

echo "Testing homework requirements..."
echo ""

BASE_URL="http://localhost:7379"

# Test 1: ADD an item
echo "1. ADD item (key='test', value='hello')"
ADD_RESULT=$(curl -s -X POST $BASE_URL/set \
  -H "Content-Type: application/json" \
  -d '{"key":"test","value":"hello"}')
echo "   Result: $ADD_RESULT"

# Test 2: FETCH the item
echo ""
echo "2. FETCH item (key='test')"
FETCH_RESULT=$(curl -s "$BASE_URL/get?key=test")
echo "   Result: $FETCH_RESULT"

# Test 3: REMOVE the item
echo ""
echo "3. REMOVE item (key='test')"
REMOVE_RESULT=$(curl -s -X POST $BASE_URL/del \
  -H "Content-Type: application/json" \
  -d '{"key":"test"}')
echo "   Result: $REMOVE_RESULT"

# Test 4: FETCH after remove (should be null)
echo ""
echo "4. FETCH after remove (should be null)"
FETCH_NULL=$(curl -s "$BASE_URL/get?key=test")
echo "   Result: $FETCH_NULL"

# Test 5: TTL test
echo ""
echo "5. ADD item with TTL (expires in 2 seconds)"
curl -s -X POST $BASE_URL/set \
  -H "Content-Type: application/json" \
  -d '{"key":"ttl-test","value":"expires-soon","px":2000}' > /dev/null
echo "   Item added with 2s TTL"

echo ""
echo "6. FETCH immediately (should exist)"
FETCH_TTL=$(curl -s "$BASE_URL/get?key=ttl-test")
echo "   Result: $FETCH_TTL"

echo ""
echo "7. Wait 3 seconds and FETCH again (should be null)"
sleep 3
FETCH_EXPIRED=$(curl -s "$BASE_URL/get?key=ttl-test")
echo "   Result: $FETCH_EXPIRED"

echo ""
echo "✓ All homework requirements tested!"
echo ""
echo "To test advanced features (ZSET, eviction, metrics), see README.md"