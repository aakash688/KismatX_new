/**
 * Idempotency Test Script
 * Tests duplicate request handling with same idempotency key
 * 
 * Usage: node tests/test-idempotency.js <userId> <gameId>
 * Example: node tests/test-idempotency.js 1 202412011200
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // Set this as environment variable

const userId = process.argv[2];
const gameId = process.argv[3];
const idempotencyKey = 'test-idempotency-' + Date.now();

if (!userId || !gameId) {
    console.error('❌ Usage: node test-idempotency.js <userId> <gameId>');
    console.error('   Example: node test-idempotency.js 1 202412011200');
    process.exit(1);
}

if (!ACCESS_TOKEN) {
    console.error('❌ ACCESS_TOKEN environment variable not set');
    console.error('   Set it with: export ACCESS_TOKEN="your_token_here"');
    process.exit(1);
}

async function placeBet() {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/bets/place`,
            {
                game_id: gameId,
                bets: [
                    {
                        card_number: 5,
                        bet_amount: 10.00
                    }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'X-Idempotency-Key': idempotencyKey,
                    'Content-Type': 'application/json'
                }
            }
        );
        return { success: true, status: response.status, data: response.data };
    } catch (error) {
        return {
            success: false,
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            data: error.response?.data
        };
    }
}

async function runIdempotencyTest() {
    console.log('🧪 Idempotency Test');
    console.log('===================');
    console.log(`User ID: ${userId}`);
    console.log(`Game ID: ${gameId}`);
    console.log(`Idempotency Key: ${idempotencyKey}`);
    console.log('');

    // First request
    console.log('📤 Sending first request...');
    const result1 = await placeBet();
    console.log(`   Status: ${result1.status}`);
    console.log(`   Success: ${result1.success ? '✅' : '❌'}`);
    if (result1.success) {
        console.log(`   Slip ID: ${result1.data?.data?.slip_id || 'N/A'}`);
        console.log(`   Duplicate: ${result1.data?.data?.duplicate || false}`);
    } else {
        console.log(`   Error: ${result1.message}`);
    }
    console.log('');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Second request with same idempotency key
    console.log('📤 Sending second request with same idempotency key...');
    const result2 = await placeBet();
    console.log(`   Status: ${result2.status}`);
    console.log(`   Success: ${result2.success ? '✅' : '❌'}`);
    if (result2.success) {
        console.log(`   Slip ID: ${result2.data?.data?.slip_id || 'N/A'}`);
        console.log(`   Duplicate: ${result2.data?.data?.duplicate || false}`);
    } else {
        console.log(`   Error: ${result2.message}`);
    }
    console.log('');

    // Verify results
    console.log('✅ Test Verification:');
    console.log('---------------------');
    
    if (!result1.success) {
        console.log('❌ TEST FAILED: First request failed');
        process.exit(1);
    }

    if (!result2.success) {
        console.log('❌ TEST FAILED: Second request failed (should return duplicate)');
        process.exit(1);
    }

    const slipId1 = result1.data?.data?.slip_id;
    const slipId2 = result2.data?.data?.slip_id;
    const isDuplicate1 = result1.data?.data?.duplicate || false;
    const isDuplicate2 = result2.data?.data?.duplicate || false;

    if (slipId1 !== slipId2) {
        console.log(`❌ TEST FAILED: Slip IDs don't match`);
        console.log(`   First: ${slipId1}`);
        console.log(`   Second: ${slipId2}`);
        process.exit(1);
    }

    if (!isDuplicate2) {
        console.log('❌ TEST FAILED: Second request not marked as duplicate');
        process.exit(1);
    }

    if (result1.status === 201 && result2.status === 200) {
        console.log('✅ TEST PASSED:');
        console.log(`   First request: 201 Created (new bet)`);
        console.log(`   Second request: 200 OK (duplicate detected)`);
        console.log(`   Same Slip ID: ${slipId1}`);
        console.log(`   Duplicate flag: ${isDuplicate2}`);
    } else {
        console.log(`⚠️  Unexpected status codes: ${result1.status}, ${result2.status}`);
    }
}

// Run the test
runIdempotencyTest().catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
});








