/**
 * Race Condition Test Script
 * Tests simultaneous bet placement to verify pessimistic locking
 * 
 * Usage: node tests/test-betting-race-condition.js <userId> <gameId> <userBalance>
 * Example: node tests/test-betting-race-condition.js 1 202412011200 100
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // Set this as environment variable

const userId = process.argv[2];
const gameId = process.argv[3];
const userBalance = parseFloat(process.argv[4]) || 100;
const betAmount = Math.ceil(userBalance * 0.8); // 80% of balance

if (!userId || !gameId) {
    console.error('❌ Usage: node test-betting-race-condition.js <userId> <gameId> [userBalance]');
    console.error('   Example: node test-betting-race-condition.js 1 202412011200 100');
    process.exit(1);
}

if (!ACCESS_TOKEN) {
    console.error('❌ ACCESS_TOKEN environment variable not set');
    console.error('   Set it with: export ACCESS_TOKEN="your_token_here"');
    process.exit(1);
}

async function placeBet(idempotencyKey, cardNumber) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/bets/place`,
            {
                game_id: gameId,
                bets: [
                    {
                        card_number: cardNumber,
                        bet_amount: betAmount
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

async function getBalance() {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/wallet/${userId}`,
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            }
        );
        // Extract balance from wallet response
        // This might need adjustment based on actual API response
        return parseFloat(response.data?.data?.balance || response.data?.balance || 0);
    } catch (error) {
        console.error('Error getting balance:', error.message);
        return null;
    }
}

async function runRaceConditionTest() {
    console.log('🧪 Race Condition Test');
    console.log('======================');
    console.log(`User ID: ${userId}`);
    console.log(`Game ID: ${gameId}`);
    console.log(`Initial Balance: ₹${userBalance}`);
    console.log(`Bet Amount: ₹${betAmount}`);
    console.log('');

    // Get initial balance
    const initialBalance = await getBalance();
    console.log(`📊 Initial Balance: ₹${initialBalance || 'N/A'}`);
    console.log('');

    // Generate unique idempotency keys for each request
    const idempotencyKey1 = `race-test-${uuidv4()}`;
    const idempotencyKey2 = `race-test-${uuidv4()}`;

    console.log('🚀 Sending 2 simultaneous bet requests...');
    console.log(`   Request 1: Card 5, Key: ${idempotencyKey1.substring(0, 20)}...`);
    console.log(`   Request 2: Card 7, Key: ${idempotencyKey2.substring(0, 20)}...`);
    console.log('');

    // Send both requests simultaneously
    const [result1, result2] = await Promise.all([
        placeBet(idempotencyKey1, 5),
        placeBet(idempotencyKey2, 7)
    ]);

    // Display results
    console.log('📋 Results:');
    console.log('-----------');
    console.log('Request 1:');
    console.log(`   Status: ${result1.status}`);
    console.log(`   Success: ${result1.success ? '✅' : '❌'}`);
    if (result1.success) {
        console.log(`   Slip ID: ${result1.data?.data?.slip_id || 'N/A'}`);
        console.log(`   New Balance: ₹${result1.data?.data?.new_balance || 'N/A'}`);
    } else {
        console.log(`   Error: ${result1.message}`);
    }
    console.log('');

    console.log('Request 2:');
    console.log(`   Status: ${result2.status}`);
    console.log(`   Success: ${result2.success ? '✅' : '❌'}`);
    if (result2.success) {
        console.log(`   Slip ID: ${result2.data?.data?.slip_id || 'N/A'}`);
        console.log(`   New Balance: ₹${result2.data?.data?.new_balance || 'N/A'}`);
    } else {
        console.log(`   Error: ${result2.message}`);
    }
    console.log('');

    // Verify results
    const successCount = [result1, result2].filter(r => r.success).length;
    const finalBalance = await getBalance();
    
    console.log('✅ Test Verification:');
    console.log('---------------------');
    console.log(`Success Count: ${successCount}/2`);
    console.log(`Expected: 1 (one should succeed, one should fail)`);
    console.log(`Final Balance: ₹${finalBalance || 'N/A'}`);
    
    if (result1.success && result2.success) {
        console.log('❌ TEST FAILED: Both bets succeeded (should only be 1)');
        process.exit(1);
    } else if (!result1.success && !result2.success) {
        console.log('⚠️  WARNING: Both bets failed (check if balance was sufficient)');
    } else {
        console.log('✅ TEST PASSED: Only one bet succeeded');
    }

    // Check balance
    if (finalBalance !== null) {
        const expectedBalance = initialBalance - betAmount;
        if (Math.abs(finalBalance - expectedBalance) < 0.01) {
            console.log(`✅ Balance correct: ₹${finalBalance} (expected ₹${expectedBalance})`);
        } else {
            console.log(`⚠️  Balance mismatch: ₹${finalBalance} (expected ₹${expectedBalance})`);
        }
        
        if (finalBalance < 0) {
            console.log('❌ TEST FAILED: Balance is negative!');
            process.exit(1);
        }
    }
}

// Run the test
runRaceConditionTest().catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
});








