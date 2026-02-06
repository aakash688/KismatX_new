/**
 * Smart Winning Card Selector
 * Implements profit-optimized card selection for auto mode
 * 
 * Logic:
 * 1. Exclude the card with highest total bet
 * 2. Calculate average bet of remaining 11 cards
 * 3. Select only from cards with below-average bets
 * 4. Randomly pick one from eligible cards
 * 5. Optional: 10% chance of full random selection for fairness
 * 
 * @module utils/winningCardSelector
 */

/**
 * Get total bets per card for a game
 * Returns array of 12 numbers representing total bet amount on each card (1-12)
 * 
 * @param {string} gameId - Game ID
 * @param {Object} betDetailRepo - TypeORM repository for BetDetail
 * @returns {Promise<Array<number>>} Array of 12 numbers [bet1, bet2, ..., bet12]
 */
async function getTotalBetsPerCard(gameId, betDetailRepo) {
    // Initialize array with 12 zeros (for cards 1-12)
    const bets = new Array(12).fill(0);
    
    // Get all bet details for this game
    const betDetails = await betDetailRepo.find({
        where: { game_id: gameId }
    });
    
    // Sum up bets for each card
    betDetails.forEach(bet => {
        const cardIndex = bet.card_number - 1; // Convert card_number (1-12) to array index (0-11)
        if (cardIndex >= 0 && cardIndex < 12) {
            bets[cardIndex] += parseFloat(bet.bet_amount || 0);
        }
    });
    
    return bets;
}

/**
 * Select winning card using smart profit-optimized logic
 * 
 * @param {Array<number>} bets - Array of 12 numbers representing total bet per card
 * @returns {number} Winning card number (1-12)
 */
function selectWinningCard(bets) {
    // Validate input
    if (!Array.isArray(bets) || bets.length !== 12) {
        throw new Error('bets must be an array of 12 numbers');
    }
    
    // Handle edge case: If no bets at all, return random card
    const totalBets = bets.reduce((sum, bet) => sum + bet, 0);
    if (totalBets === 0) {
        // No bets on any card - pick completely random
        return Math.floor(Math.random() * 12) + 1;
    }
    
    // Step 1: Find the card with the highest bet
    const maxBet = Math.max(...bets);
    
    // Find all cards with maximum bet (handle ties)
    const maxIndices = [];
    bets.forEach((bet, idx) => {
        if (bet === maxBet) {
            maxIndices.push(idx);
        }
    });
    
    // If multiple cards have max bet, pick the first one to exclude
    const maxIndex = maxIndices[0];
    
    // Step 2: Build a new array excluding the highest bet card(s)
    const filteredBets = bets.filter((_, idx) => !maxIndices.includes(idx));
    
    // Step 3: Compute average of the remaining bets
    // Handle case where all cards might have same bet (filteredBets could be empty or all same)
    let avgBet = 0;
    if (filteredBets.length > 0) {
        avgBet = filteredBets.reduce((a, b) => a + b, 0) / filteredBets.length;
    } else {
        // All cards have same bet or only one card - fallback to random
        return Math.floor(Math.random() * 12) + 1;
    }
    
    // Step 4: Find all cards below average (excluding the highest-bet one(s))
    let belowAvgCards = [];
    bets.forEach((bet, idx) => {
        if (!maxIndices.includes(idx) && bet < avgBet) {
            belowAvgCards.push(idx); // Store card index (0-11)
        }
    });
    
    // Step 5: If no below-average cards exist, fallback to all except highest
    // This ensures we always have candidates to choose from
    if (belowAvgCards.length === 0) {
        belowAvgCards = bets.map((_, idx) => idx).filter(idx => !maxIndices.includes(idx));
    }
    
    // Safety check: If still no candidates (shouldn't happen), use all cards
    if (belowAvgCards.length === 0) {
        belowAvgCards = bets.map((_, idx) => idx);
    }
    
    // Step 6: Optional fairness randomization (10% chance)
    // This prevents pattern exploitation while maintaining profitability
    let finalCandidates = belowAvgCards;
    if (Math.random() < 0.1) {
        // 10% of the time, pick from all cards (full random for fairness)
        finalCandidates = bets.map((_, idx) => idx);
    }
    
    // Step 7: Randomly select one from the final candidates
    const randomIndex = Math.floor(Math.random() * finalCandidates.length);
    const winningCardIndex = finalCandidates[randomIndex];
    
    // Step 8: Return the winning card number (1-12)
    const winningCard = winningCardIndex + 1;
    
    return winningCard;
}

/**
 * Select winning card for a game (main function)
 * 
 * @param {string} gameId - Game ID
 * @param {Object} betDetailRepo - TypeORM repository for BetDetail
 * @returns {Promise<number>} Winning card number (1-12)
 */
export async function selectWinningCardForGame(gameId, betDetailRepo) {
    // Get total bets per card
    const bets = await getTotalBetsPerCard(gameId, betDetailRepo);
    
    // Use smart selection logic
    const winningCard = selectWinningCard(bets);
    
    return winningCard;
}

/**
 * Calculate expected profit for admin if a specific card wins
 * 
 * @param {Array<number>} bets - Array of 12 numbers representing total bet per card
 * @param {number} winningCard - Winning card number (1-12)
 * @param {number} multiplier - Payout multiplier
 * @returns {Object} Profit analysis
 */
export function calculateProfit(bets, winningCard, multiplier = 10) {
    const totalWagered = bets.reduce((sum, bet) => sum + bet, 0);
    const cardIndex = winningCard - 1;
    const betOnWinningCard = bets[cardIndex] || 0;
    const totalPayout = betOnWinningCard * multiplier;
    const profit = totalWagered - totalPayout;
    const profitPercentage = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
    
    return {
        total_wagered: totalWagered,
        bet_on_winning_card: betOnWinningCard,
        total_payout: totalPayout,
        profit: profit,
        profit_percentage: profitPercentage,
        is_profitable: profit >= 0
    };
}

// Export the core selection function for testing
export { selectWinningCard, getTotalBetsPerCard };

