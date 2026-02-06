/**
 * Slip Cancellation Service for Cloudflare Workers
 * Handles slip cancellation and refund
 * 
 * @module services/slipCancellationService
 */

import { getSupabaseClient, executeQuery } from '../config/supabase.js';

/**
 * Cancel and refund a bet slip
 * Users can cancel their own slips, admins can cancel any slip
 * 
 * @param {Object} env - Cloudflare Workers environment
 * @param {string} identifier - Slip ID (UUID) or barcode
 * @param {number} userId - User ID who is canceling (user or admin)
 * @param {boolean} isAdmin - Whether the user is an admin
 * @param {string} reason - Reason for cancellation
 * @param {string} ipAddress - User IP address
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Cancellation result
 */
export async function cancelSlip(env, identifier, userId, isAdmin, reason, ipAddress, userAgent) {
  const supabase = getSupabaseClient(env);
  
  try {
    // Step 1: Find bet slip by slip_id or barcode
    const { data: slips, error: slipError } = await supabase
      .from('bet_slips')
      .select('*')
      .or(`slip_id.eq.${identifier},barcode.eq.${identifier}`);
    
    if (slipError || !slips || slips.length === 0) {
      throw new Error('Bet slip not found');
    }
    
    const slip = slips[0];
    
    // Step 2: Validate Ownership
    if (!isAdmin && slip.user_id !== userId) {
      throw new Error('You do not have permission to cancel this slip');
    }
    
    // Step 3: Validate Cancellation Eligibility
    if (slip.claimed === true) {
      throw new Error('Cannot cancel a slip that has already been claimed');
    }
    
    // Check if slip was already cancelled
    const { data: existingCancellation } = await supabase
      .from('wallet_logs')
      .select('id')
      .eq('reference_type', 'cancellation')
      .eq('reference_id', slip.slip_id)
      .single();
    
    if (existingCancellation) {
      throw new Error('This slip has already been cancelled');
    }
    
    // Get game to check settlement status
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', slip.game_id)
        .single()
    );
    
    if (!game) {
      throw new Error('Game not found');
    }
    
    // Cannot cancel after game is settled
    if (game.settlement_status === 'settled') {
      throw new Error('Cannot cancel slip after game has been settled');
    }
    
    // Step 4: Get user to validate and update balance
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('*')
        .eq('id', slip.user_id)
        .single()
    );
    
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.status !== 'active') {
      throw new Error(`Cannot refund to inactive user account. Account status: ${user.status}`);
    }
    
    // Step 5: Calculate refund amount
    const refundAmount = parseFloat(slip.total_amount || 0);
    
    if (refundAmount <= 0) {
      throw new Error('Refund amount is zero or invalid');
    }
    
    // Step 6: Get bet details to update card totals
    const { data: betDetails } = await supabase
      .from('bet_details')
      .select('card_number, bet_amount')
      .eq('slip_id', slip.id);
    
    // Step 7: Update user balance
    const currentBalance = parseFloat(user.deposit_amount || 0);
    const newBalance = currentBalance + refundAmount;
    
    await executeQuery(() =>
      supabase
        .from('users')
        .update({ deposit_amount: newBalance })
        .eq('id', slip.user_id)
    );
    
    // Step 8: Update card totals (subtract cancelled bets)
    if (betDetails && betDetails.length > 0) {
      for (const detail of betDetails) {
        const { data: cardTotal } = await supabase
          .from('game_card_totals')
          .select('*')
          .eq('game_id', slip.game_id)
          .eq('card_number', detail.card_number)
          .single();
        
        if (cardTotal) {
          const currentTotal = parseFloat(cardTotal.total_bet_amount || 0);
          const betAmount = parseFloat(detail.bet_amount || 0);
          const newTotal = Math.max(0, currentTotal - betAmount);
          
          await supabase
            .from('game_card_totals')
            .update({ total_bet_amount: newTotal })
            .eq('id', cardTotal.id);
          
          console.log(`📉 Updated card ${detail.card_number} total: ${currentTotal} -> ${newTotal} (subtracted ${betAmount})`);
        }
      }
    }
    
    // Step 9: Mark Slip Status (same as Node.js - sets to 'lost' when cancelled)
    // Note: 'cancelled' is not in the enum, so we mark as 'lost' and track via wallet_logs
    // This matches Node.js behavior exactly
    await executeQuery(() =>
      supabase
        .from('bet_slips')
        .update({ status: 'lost' })
        .eq('id', slip.id)
    );
    
    // Step 10: Create wallet log for refund (same as Node.js)
    const cancellationReason = reason || (isAdmin ? 'Slip cancelled by admin' : 'Slip cancelled by user');
    
    await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .insert({
          user_id: slip.user_id,
          transaction_type: 'game',
          amount: refundAmount,
          transaction_direction: 'credit',
          comment: `Refund for cancelled slip ${slip.slip_id} (${slip.barcode}), Game: ${slip.game_id}. Reason: ${cancellationReason}`,
          reference_type: 'cancellation',
          reference_id: slip.slip_id
          // Note: status column doesn't exist in Supabase wallet_logs table
        })
    );
    
    // Step 11: Create audit log
    const auditAction = isAdmin ? 'admin_cancelled_slip' : 'user_cancelled_slip';
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: isAdmin ? userId : null,
          action: auditAction,
          target_type: 'bet_slip',
          target_id: slip.id.toString(),
          details: `Slip cancelled: ${slip.slip_id} (${slip.barcode}), Game: ${slip.game_id}, Refund: ₹${refundAmount.toFixed(2)}, Reason: ${cancellationReason}, Cancelled by: ${isAdmin ? 'Admin' : 'User'}`,
          ip_address: ipAddress,
          user_agent: userAgent
        })
    );
    
    console.log(`✅ Slip cancelled successfully: ${slip.slip_id}, Refund: ₹${refundAmount.toFixed(2)}, User: ${slip.user_id}`);
    
    return {
      success: true,
      slip_id: slip.slip_id,
      barcode: slip.barcode,
      refund_amount: refundAmount,
      new_balance: newBalance,
      game_id: slip.game_id,
      reason: cancellationReason
    };
    
  } catch (error) {
    console.error(`❌ Error cancelling slip ${identifier}:`, error);
    throw error;
  }
}
