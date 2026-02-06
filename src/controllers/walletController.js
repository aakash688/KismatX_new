// Wallet Controller
// Handles wallet transactions and transaction logging

import { AppDataSource } from "../config/typeorm.config.js";
import { DataSource } from "typeorm";
import { auditLog } from "../utils/auditLogger.js";

const UserEntity = "User";
const WalletLogEntity = "WalletLog";

/**
 * Create a new wallet transaction
 * POST /api/wallet/transaction
 * 
 * Transaction types: recharge, withdrawal, game
 * Directions: credit (add money), debit (deduct money)
 * 
 * Validates balance cannot go negative after debit
 * Uses database transaction for atomicity
 */
export const createTransaction = async (req, res, next) => {
    const queryRunner = AppDataSource.createQueryRunner();
    let transactionStarted = false;
    
    try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        transactionStarted = true;
        const {
            user_id,
            transaction_type,
            amount,
            transaction_direction,
            game_id = null,
            comment = ""
        } = req.body;

        console.log('💳 Creating wallet transaction:', {
            user_id,
            transaction_type,
            amount,
            transaction_direction,
            game_id,
            comment
        });

        // Validation
        if (!user_id || !transaction_type || !amount || !transaction_direction) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            return res.status(400).json({
                success: false,
                message: "Missing required fields: user_id, transaction_type, amount, transaction_direction"
            });
        }

        if (!["recharge", "withdrawal", "game"].includes(transaction_type)) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            return res.status(400).json({
                success: false,
                message: "Invalid transaction_type. Must be: recharge, withdrawal, or game"
            });
        }

        if (!["credit", "debit"].includes(transaction_direction)) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            return res.status(400).json({
                success: false,
                message: "Invalid transaction_direction. Must be: credit or debit"
            });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            return res.status(400).json({
                success: false,
                message: "Amount must be a positive number"
            });
        }

        // Get user repository
        const userRepo = queryRunner.manager.getRepository(UserEntity);
        const walletLogRepo = queryRunner.manager.getRepository(WalletLogEntity);

        // Fetch user with current balance
        const user = await userRepo.findOne({ where: { id: user_id } });
        if (!user) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            return res.status(404).json({ 
                success: false,
                message: "User not found" 
            });
        }

        // Calculate new balance
        const currentBalance = parseFloat(user.deposit_amount) || 0;
        let newBalance;

        if (transaction_direction === "credit") {
            newBalance = currentBalance + parsedAmount;
        } else {
            newBalance = currentBalance - parsedAmount;
            // Validate balance won't go negative
            if (newBalance < 0) {
                if (transactionStarted) {
                    await queryRunner.rollbackTransaction();
                    transactionStarted = false;
                }
                return res.status(400).json({
                    success: false,
                    message: `Insufficient balance. Current balance: ₹${currentBalance.toFixed(2)}, Required: ₹${parsedAmount.toFixed(2)}`
                });
            }
        }

        // Update user balance
        user.deposit_amount = newBalance;
        await userRepo.save(user);

        // Create wallet log
        const walletLog = walletLogRepo.create({
            user_id,
            transaction_type,
            amount: parsedAmount,
            transaction_direction,
            game_id,
            comment: comment || getDefaultComment(transaction_type, transaction_direction)
        });

        const savedLog = await walletLogRepo.save(walletLog);

        // Commit transaction BEFORE audit logging to prevent lock contention
        await queryRunner.commitTransaction();
        transactionStarted = false;

        // Log admin action (AFTER transaction commit to avoid blocking)
        // Fire-and-forget to prevent blocking the main flow
        auditLog({
            admin_id: req.user?.id,
            user_id: user_id,
            action: "wallet_transaction",
            target_type: "wallet",
            target_id: savedLog.id,
            details: `${transaction_type} ${transaction_direction}: ₹${parsedAmount.toFixed(2)} - ${savedLog.comment}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        }).catch(err => {
            // Log error but don't throw - audit logging is non-critical
            console.error('⚠️ Failed to log audit event (non-critical):', err.message);
        });

        console.log('✅ Transaction created successfully:', {
            logId: savedLog.id,
            newBalance
        });

        return res.status(201).json({
            success: true,
            message: "Transaction completed successfully",
            transaction: {
                id: savedLog.id,
                user_id: savedLog.user_id,
                transaction_type: savedLog.transaction_type,
                amount: savedLog.amount,
                transaction_direction: savedLog.transaction_direction,
                game_id: savedLog.game_id,
                comment: savedLog.comment,
                created_at: savedLog.created_at
            },
            user: {
                id: user.id,
                user_id: user.user_id,
                previous_balance: currentBalance,
                new_balance: newBalance
            }
        });

    } catch (err) {
        if (transactionStarted) {
            try {
                await queryRunner.rollbackTransaction();
            } catch (rollbackErr) {
                next(rollbackErr)
                console.error('❌ Error during rollback:', rollbackErr);
            }
        }
        console.error('❌ Wallet transaction error:', err);
        console.error('❌ Error stack:', err.stack);
        next(err);
    } finally {
        try {
            await queryRunner.release();
        } catch (releaseErr) {
            next(releaseErr)
            console.error('❌ Error releasing query runner:', releaseErr);
        }
    }
};

/**
 * Get all transactions for a user
 * GET /api/wallet/:user_id
 * 
 * Supports pagination, filtering by type, and date range
 */
export const getUserTransactions = async (req, res, next) => {
    try {
        const { user_id } = req.params;
        const {
            page = 1,
            limit = 20,
            transaction_type,
            date_from,
            date_to,
            direction
        } = req.query;

        console.log('📋 Fetching wallet transactions for user:', user_id);

        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const queryBuilder = walletLogRepo.createQueryBuilder("wallet_log")
            .leftJoinAndSelect("wallet_log.user", "user")
            .select([
                "wallet_log.id",
                "wallet_log.user_id",
                "wallet_log.transaction_type",
                "wallet_log.amount",
                "wallet_log.transaction_direction",
                "wallet_log.game_id",
                "wallet_log.comment",
                "wallet_log.created_at",
                "user.user_id",
                "user.first_name",
                "user.last_name"
            ])
            .where("wallet_log.user_id = :user_id", { user_id });

        // Apply filters
        if (transaction_type) {
            queryBuilder.andWhere("wallet_log.transaction_type = :transaction_type", { transaction_type });
        }

        if (direction) {
            queryBuilder.andWhere("wallet_log.transaction_direction = :direction", { direction });
        }

        if (date_from) {
            queryBuilder.andWhere("wallet_log.created_at >= :date_from", { date_from });
        }

        if (date_to) {
            queryBuilder.andWhere("wallet_log.created_at <= :date_to", { date_to });
        }

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        queryBuilder.skip(offset).take(parseInt(limit));
        queryBuilder.orderBy("wallet_log.created_at", "DESC");

        const [transactions, total] = await queryBuilder.getManyAndCount();

        res.json({
            transactions: transactions.map(log => ({
                id: log.id,
                user_id: log.user_id,
                user_name: log.user ? `${log.user.first_name} ${log.user.last_name}` : null,
                transaction_type: log.transaction_type,
                amount: parseFloat(log.amount),
                transaction_direction: log.transaction_direction,
                game_id: log.game_id,
                comment: log.comment,
                created_at: log.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (err) {
        console.error('❌ Get user transactions error:', err);
        next(err);
    }
};

/**
 * Get specific transaction details
 * GET /api/wallet/transaction/:id
 */
export const getTransactionById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const transaction = await walletLogRepo.findOne({
            where: { id },
            relations: ["user"]
        });

        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        res.json({
            transaction: {
                id: transaction.id,
                user_id: transaction.user_id,
                user_name: transaction.user ? `${transaction.user.first_name} ${transaction.user.last_name}` : null,
                transaction_type: transaction.transaction_type,
                amount: parseFloat(transaction.amount),
                transaction_direction: transaction.transaction_direction,
                game_id: transaction.game_id,
                comment: transaction.comment,
                created_at: transaction.created_at
            }
        });

    } catch (err) {
        console.error('❌ Get transaction by ID error:', err);
        next(err);
    }
};

/**
 * Update transaction (only comment allowed for audit compliance)
 * PUT /api/wallet/transaction/:id
 */
export const updateTransaction = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;

        if (comment === undefined) {
            return res.status(400).json({
                message: "Comment field is required for update"
            });
        }

        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const transaction = await walletLogRepo.findOne({ where: { id } });

        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        // Only allow comment updates
        transaction.comment = comment || transaction.comment;
        const updatedTransaction = await walletLogRepo.save(transaction);

        // Log admin action
        await auditLog({
            admin_id: req.user?.id,
            user_id: transaction.user_id,
            action: "wallet_transaction_updated",
            target_type: "wallet",
            target_id: transaction.id,
            details: `Updated transaction comment: ${comment}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Transaction updated successfully",
            transaction: {
                id: updatedTransaction.id,
                comment: updatedTransaction.comment,
                created_at: updatedTransaction.created_at
            }
        });

    } catch (err) {
        console.error('❌ Update transaction error:', err);
        next(err);
    }
};

/**
 * Soft delete transaction (for audit compliance)
 * DELETE /api/wallet/transaction/:id
 * 
 * Note: This is a soft delete - transaction is marked as deleted but remains in database
 */
export const deleteTransaction = async (req, res, next) => {
    try {
        const { id } = req.params;

        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const transaction = await walletLogRepo.findOne({ where: { id } });

        if (!transaction) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        // For audit compliance, we don't actually delete, just mark as deleted
        // If you want true deletion, uncomment the line below:
        // await walletLogRepo.delete(id);

        // Soft delete - update comment to indicate deletion
        transaction.comment = `[DELETED] ${transaction.comment || ''} - Deleted by admin ${req.user?.id || 'system'}`;
        await walletLogRepo.save(transaction);

        // Log admin action
        await auditLog({
            admin_id: req.user?.id,
            user_id: transaction.user_id,
            action: "wallet_transaction_deleted",
            target_type: "wallet",
            target_id: transaction.id,
            details: "Transaction marked as deleted",
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Transaction deleted successfully"
        });

    } catch (err) {
        console.error('❌ Delete transaction error:', err);
        next(err);
    }
};

/**
 * Get all wallet logs (for all users, admin only)
 * GET /api/wallet/logs
 * Supports filters: page, limit, user_id, transaction_type, direction, date_from, date_to
 */
export const getAllWalletLogs = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            user_id,
            transaction_type,
            direction,
            date_from,
            date_to,
            search
        } = req.query;
        
        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const queryBuilder = walletLogRepo.createQueryBuilder("wallet_log")
            .leftJoinAndSelect("wallet_log.user", "user")
            .select([
                "wallet_log.id",
                "wallet_log.user_id",
                "wallet_log.transaction_type",
                "wallet_log.amount",
                "wallet_log.transaction_direction",
                "wallet_log.game_id",
                "wallet_log.comment",
                "wallet_log.created_at",
                "user.user_id",
                "user.first_name",
                "user.last_name"
            ]);

        if (user_id) {
            queryBuilder.andWhere("wallet_log.user_id = :user_id", { user_id });
        }
        if (transaction_type) {
            queryBuilder.andWhere("wallet_log.transaction_type = :transaction_type", { transaction_type });
        }
        if (direction) {
            queryBuilder.andWhere("wallet_log.transaction_direction = :direction", { direction });
        }
        if (date_from) {
            queryBuilder.andWhere("wallet_log.created_at >= :date_from", { date_from });
        }
        if (date_to) {
            queryBuilder.andWhere("wallet_log.created_at <= :date_to", { date_to });
        }
        if (search) {
            queryBuilder.andWhere("(user.user_id LIKE :search OR user.first_name LIKE :search OR user.last_name LIKE :search OR wallet_log.comment LIKE :search)", { search: `%${search}%` });
        }
        
        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        queryBuilder.skip(offset).take(parseInt(limit));
        queryBuilder.orderBy("wallet_log.created_at", "DESC");
        
        const [logs, total] = await queryBuilder.getManyAndCount();
        res.json({
            logs: logs.map(log => ({
                id: log.id,
                user_id: log.user_id,
                user_name: log.user ? `${log.user.first_name} ${log.user.last_name}` : null,
                user_code: log.user ? log.user.user_id : null,
                transaction_type: log.transaction_type,
                amount: parseFloat(log.amount),
                transaction_direction: log.transaction_direction,
                game_id: log.game_id,
                comment: log.comment,
                created_at: log.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('❌ Get all wallet logs error:', err);
        next(err);
    }
};

/**
 * Get wallet summary for a user
 * GET /api/wallet/summary/:user_id
 * Returns balance, total credits, total debits, total transactions
 */
export const getUserWalletSummary = async (req, res, next) => {
    try {
        const { user_id } = req.params;
        const userRepo = AppDataSource.getRepository(UserEntity);
        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        
        const user = await userRepo.findOne({ where: { id: user_id } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const balance = parseFloat(user.deposit_amount || 0);
        const [credits, debits, totalTransactions] = await Promise.all([
            walletLogRepo
                .createQueryBuilder("log")
                .where("log.user_id = :user_id", { user_id })
                .andWhere("log.transaction_direction = 'credit'")
                .select("SUM(log.amount)", "sum")
                .getRawOne(),
            walletLogRepo
                .createQueryBuilder("log")
                .where("log.user_id = :user_id", { user_id })
                .andWhere("log.transaction_direction = 'debit'")
                .select("SUM(log.amount)", "sum")
                .getRawOne(),
            walletLogRepo.count({ where: { user_id } })
        ]);
        res.json({
            user: {
                id: user.id,
                user_id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name
            },
            balance,
            total_credits: parseFloat(credits?.sum || 0),
            total_debits: parseFloat(debits?.sum || 0),
            total_transactions: totalTransactions
        });
    } catch (err) {
        console.error('❌ Get wallet summary error:', err);
        next(err);
    }
};

/**
 * Helper function to generate default comments
 */
function getDefaultComment(transaction_type, transaction_direction) {
    const directionText = transaction_direction === "credit" ? "Credited" : "Debited";
    
    switch (transaction_type) {
        case "recharge":
            return `${directionText} by admin`;
        case "withdrawal":
            return `User ${directionText === "Credited" ? "refund" : "withdrawal"}`;
        case "game":
            return `Game transaction ${directionText === "Credited" ? "win" : "loss"}`;
        default:
            return `${transaction_type} ${directionText}`;
    }
}

