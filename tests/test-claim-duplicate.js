/**
 * Claim Duplicate Prevention Test Script
 * Tests that winnings cannot be claimed twice
 * 
 * Usage: node tests/test-claim-duplicate.js <userId> <slipIdOrBarcode>
 * Example: node tests/test-claim-duplicate.js 1 abc-123-def-456
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // Set this as environment variable

const userId = process.argv[2];
const identifier = process.argv[3]; // slip_id or barcode

if (!userId || !identifier) {
    console.error('❌ Usage: node test-claim-duplicate.js <userId> <slipIdOrBarcode>');
    console.error('   Example: node test-claim-duplicate.js 1 abc-123-def-456');
    process.exit(1);
}

if (!ACCESS_TOKEN) {
    console.error('❌ ACCESS_TOKEN environment variable not set');
    console.error('   Set it with: export ACCESS_TOKEN="your_token_here"');
    process.exit(1);
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
        return parseFloat(response.data?.data?.balance || response.data?.balance || 0);
    } catch (error) {
        console.error('Error getting balance:', error.message);
        return null;
    }
}

async function getBetSlip(identifier) {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/bets/slip/${identifier}`,
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            }
        );
        return { success: true, data: response.data?.data || null };
    } catch (error) {
        return {
            success: false,
            message: error.response?.data?.message || error.message
        };
    }
}

async function claimWinnings(identifier) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/bets/claim`,
            { identifier },
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
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

async function runClaimDuplicateTest() {
    console.log('🧪 Claim Duplicate Prevention Test');
    console.log('===================================');
    console.log(`User ID: ${userId}`);
    console.log(`Slip Identifier: ${identifier}`);
    console.log('');

    // Get bet slip details
    console.log('📋 Fetching bet slip details...');
    const slipResult = await getBetSlip(identifier);
    if (!slipResult.success || !slipResult.data) {
        console.error(`❌ Could not fetch bet slip: ${slipResult.message}`);
        process.exit(1);
    }

    const slip = slipResult.data;
    console.log(`   Slip ID: ${slip.slip_id}`);
    console.log(`   Status: ${slip.status}`);
    console.log(`   Payout Amount: ₹${slip.payout_amount || 0}`);
    console.log(`   Claimed: ${slip.claimed || false}`);
    console.log('');

    if (slip.status !== 'won') {
        console.error('❌ Bet slip did not win. Cannot test claim.');
        process.exit(1);
    }

    if (slip.claimed) {
        console.log('⚠️  Bet slip is already claimed. Testing duplicate claim prevention...');
    }

    // Get initial balance
    const initialBalance = await getBalance();
    console.log(`📊 Initial Balance: ₹${initialBalance || 'N/A'}`);
    console.log('');

    // First claim
    console.log('📤 Attempting first claim...');
    const result1 = await claimWinnings(identifier);
    console.log(`   Status: ${result1.status}`);
    console.log(`   Success: ${result1.success ? '✅' : '❌'}`);
    if (result1.success) {
        console.log(`   Amount Credited: ₹${result1.data?.data?.amount || 'N/A'}`);
        console.log(`   New Balance: ₹${result1.data?.data?.new_balance || 'N/A'}`);
    } else {
        console.log(`   Error: ${result1.message}`);
        if (result1.message.includes('already been claimed')) {
            console.log('   ⚠️  Slip was already claimed (expected if running test again)');
        }
    }
    console.log('');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get balance after first claim
    const balanceAfterFirst = await getBalance();
    console.log(`📊 Balance After First Claim: ₹${balanceAfterFirst || 'N/A'}`);
    console.log('');

    // Second claim attempt
    console.log('📤 Attempting second claim (should fail)...');
    const result2 = await claimWinnings(identifier);
    console.log(`   Status: ${result2.status}`);
    console.log(`   Success: ${result2.success ? '✅' : '❌'}`);
    if (result2.success) {
        console.log(`   Amount Credited: ₹${result2.data?.data?.amount || 'N/A'}`);
        console.log(`   New Balance: ₹${result2.data?.data?.new_balance || 'N/A'}`);
    } else {
        console.log(`   Error: ${result2.message}`);
    }
    console.log('');

    // Get final balance
    const finalBalance = await getBalance();
    console.log(`📊 Final Balance: ₹${finalBalance || 'N/A'}`);
    console.log('');

    // Verify results
    console.log('✅ Test Verification:');
    console.log('---------------------');
    
    const expectedAmount = parseFloat(slip.payout_amount || 0);
    
    if (!result1.success && result1.message.includes('already been claimed')) {
        console.log('⚠️  First claim failed (slip already claimed previously)');
        console.log('   This is expected if the slip was claimed before running this test');
    } else if (!result1.success) {
        console.log('❌ TEST FAILED: First claim failed unexpectedly');
        console.log(`   Error: ${result1.message}`);
        process.exit(1);
    } else {
        console.log('✅ First claim succeeded');
        
        // Check balance increase
        if (balanceAfterFirst !== null && initialBalance !== null) {
            const balanceIncrease = balanceAfterFirst - initialBalance;
            if (Math.abs(balanceIncrease - expectedAmount) < 0.01) {
                console.log(`✅ Balance increased correctly: +₹${balanceIncrease}`);
            } else {
                console.log(`⚠️  Balance increase mismatch: +₹${balanceIncrease} (expected +₹${expectedAmount})`);
            }
        }
    }

    // Second claim should fail
    if (result2.success) {
        console.log('❌ TEST FAILED: Second claim succeeded (should have failed)');
        
        // Check if balance increased again
        if (finalBalance !== null && balanceAfterFirst !== null) {
            const secondIncrease = finalBalance - balanceAfterFirst;
            if (secondIncrease > 0.01) {
                console.log(`❌ Balance increased again: +₹${secondIncrease}`);
                console.log('   This is a critical error - duplicate claim allowed!');
            }
        }
        process.exit(1);
    } else {
        if (result2.message.includes('already been claimed') || 
            result2.message.includes('already claimed')) {
            console.log('✅ Second claim correctly rejected');
            console.log(`   Error message: ${result2.message}`);
        } else {
            console.log(`⚠️  Second claim failed, but with unexpected error: ${result2.message}`);
        }
    }

    // Verify balance only increased once
    if (finalBalance !== null && initialBalance !== null && result1.success) {
        const totalIncrease = finalBalance - initialBalance;
        if (Math.abs(totalIncrease - expectedAmount) < 0.01) {
            console.log(`✅ Balance increased exactly once: +₹${totalIncrease}`);
        } else if (totalIncrease > expectedAmount + 0.01) {
            console.log(`❌ Balance increased more than expected: +₹${totalIncrease} (expected +₹${expectedAmount})`);
            process.exit(1);
        }
    }

    // Verify slip is marked as claimed
    const slipAfter = await getBetSlip(identifier);
    if (slipAfter.success && slipAfter.data) {
        if (slipAfter.data.claimed) {
            console.log('✅ Slip marked as claimed');
            if (slipAfter.data.claimed_at) {
                console.log(`   Claimed at: ${slipAfter.data.claimed_at}`);
            }
        } else {
            console.log('⚠️  Slip not marked as claimed');
        }
    }
}

// Run the test
runClaimDuplicateTest().catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
});








