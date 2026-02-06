/**
 * Settlement Accuracy Test Script
 * Tests payout calculations for game settlement
 * 
 * Usage: node tests/test-settlement-accuracy.js <gameId> <winningCard> <adminId>
 * Example: node tests/test-settlement-accuracy.js 202412011200 7 1
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001/api';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // Set this as environment variable (admin token)

const gameId = process.argv[2];
const winningCard = parseInt(process.argv[3]);
const adminId = process.argv[4] || '1';

if (!gameId || !winningCard) {
    console.error('❌ Usage: node test-settlement-accuracy.js <gameId> <winningCard> [adminId]');
    console.error('   Example: node test-settlement-accuracy.js 202412011200 7 1');
    process.exit(1);
}

if (!ACCESS_TOKEN) {
    console.error('❌ ACCESS_TOKEN environment variable not set');
    console.error('   Set it with: export ACCESS_TOKEN="your_admin_token_here"');
    process.exit(1);
}

if (winningCard < 1 || winningCard > 12) {
    console.error('❌ Winning card must be between 1 and 12');
    process.exit(1);
}

async function getGame(gameId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/games/${gameId}`);
        return response.data?.data || null;
    } catch (error) {
        console.error('Error getting game:', error.message);
        return null;
    }
}

async function getBetSlips(gameId) {
    try {
        // This endpoint might need to be implemented
        // For now, we'll query directly or use admin endpoint
        const response = await axios.get(
            `${API_BASE_URL}/admin/games/${gameId}/bet-slips`,
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`
                }
            }
        );
        return response.data?.data || [];
    } catch (error) {
        console.error('Error getting bet slips:', error.message);
        return [];
    }
}

async function settleGame(gameId, winningCard) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/games/${gameId}/settle`,
            { winning_card: winningCard },
            {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            message: error.response?.data?.message || error.message,
            data: error.response?.data
        };
    }
}

async function verifyPayouts(gameId, winningCard, multiplier) {
    try {
        // Get all bet slips for this game
        const slips = await getBetSlips(gameId);
        
        console.log(`\n📊 Verifying payouts for ${slips.length} bet slips:`);
        console.log('='.repeat(60));
        
        let totalExpectedPayout = 0;
        let totalActualPayout = 0;
        let errors = [];

        for (const slip of slips) {
            console.log(`\nSlip ID: ${slip.slip_id}`);
            console.log(`  Status: ${slip.status}`);
            console.log(`  Payout Amount: ₹${slip.payout_amount || 0}`);
            
            // Calculate expected payout
            let expectedPayout = 0;
            let hasWinner = false;
            
            if (slip.bets && Array.isArray(slip.bets)) {
                for (const bet of slip.bets) {
                    if (bet.card_number === winningCard) {
                        const betPayout = parseFloat(bet.bet_amount) * multiplier;
                        expectedPayout += betPayout;
                        hasWinner = true;
                        console.log(`    Card ${bet.card_number}: ₹${bet.bet_amount} → ₹${betPayout} (WINNER)`);
                    } else {
                        console.log(`    Card ${bet.card_number}: ₹${bet.bet_amount} → ₹0 (loser)`);
                    }
                }
            }
            
            const actualPayout = parseFloat(slip.payout_amount || 0);
            totalExpectedPayout += expectedPayout;
            totalActualPayout += actualPayout;
            
            if (Math.abs(actualPayout - expectedPayout) > 0.01) {
                errors.push({
                    slipId: slip.slip_id,
                    expected: expectedPayout,
                    actual: actualPayout
                });
                console.log(`  ❌ PAYOUT MISMATCH: Expected ₹${expectedPayout}, Got ₹${actualPayout}`);
            } else {
                console.log(`  ✅ Payout correct: ₹${actualPayout}`);
            }
            
            // Check status
            const expectedStatus = hasWinner ? 'won' : 'lost';
            if (slip.status !== expectedStatus) {
                errors.push({
                    slipId: slip.slip_id,
                    issue: `Status mismatch: Expected '${expectedStatus}', Got '${slip.status}'`
                });
                console.log(`  ❌ STATUS MISMATCH: Expected '${expectedStatus}', Got '${slip.status}'`);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log(`Total Expected Payout: ₹${totalExpectedPayout}`);
        console.log(`Total Actual Payout: ₹${totalActualPayout}`);
        
        if (errors.length > 0) {
            console.log(`\n❌ TEST FAILED: Found ${errors.length} errors`);
            return false;
        } else {
            console.log('\n✅ TEST PASSED: All payouts correct');
            return true;
        }
    } catch (error) {
        console.error('Error verifying payouts:', error);
        return false;
    }
}

async function runSettlementTest() {
    console.log('🧪 Settlement Accuracy Test');
    console.log('===========================');
    console.log(`Game ID: ${gameId}`);
    console.log(`Winning Card: ${winningCard}`);
    console.log('');

    // Get game details
    console.log('📋 Fetching game details...');
    const game = await getGame(gameId);
    if (!game) {
        console.error('❌ Game not found');
        process.exit(1);
    }
    
    const multiplier = parseFloat(game.payout_multiplier || 10);
    console.log(`   Payout Multiplier: ${multiplier}x`);
    console.log(`   Status: ${game.status}`);
    console.log('');

    if (game.status !== 'completed') {
        console.error('❌ Game is not completed. Complete the game first.');
        process.exit(1);
    }

    if (game.settlement_status === 'settled') {
        console.log('⚠️  Game is already settled. Verifying payouts...');
        const verified = await verifyPayouts(gameId, winningCard, multiplier);
        process.exit(verified ? 0 : 1);
    }

    // Settle the game
    console.log(`🎯 Settling game with winning card ${winningCard}...`);
    const settlementResult = await settleGame(gameId, winningCard);
    
    if (!settlementResult.success) {
        console.error(`❌ Settlement failed: ${settlementResult.message}`);
        process.exit(1);
    }

    console.log('✅ Settlement completed');
    console.log(`   Winning Slips: ${settlementResult.data?.data?.winning_slips || 0}`);
    console.log(`   Losing Slips: ${settlementResult.data?.data?.losing_slips || 0}`);
    console.log(`   Total Payout: ₹${settlementResult.data?.data?.total_payout || 0}`);
    console.log('');

    // Verify payouts
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for DB sync
    const verified = await verifyPayouts(gameId, winningCard, multiplier);
    
    process.exit(verified ? 0 : 1);
}

// Run the test
runSettlementTest().catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
});








