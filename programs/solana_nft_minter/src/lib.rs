use anchor_lang::prelude::*;

declare_id!("Ei5xnaevxCDs637ztMBcvPvnAo1nZGdmtKAqQ7yGkNTN");

const MAX_NAME_LEN: usize = 48;
const MAX_SYMBOL_LEN: usize = 16;
const MAX_URI_LEN: usize = 200;

#[program]
pub mod solana_nft_minter {
    use super::*;

    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        symbol: String,
    ) -> Result<()> {
        require!(!name.trim().is_empty(), MintError::NameRequired);
        require!(name.as_bytes().len() <= MAX_NAME_LEN, MintError::NameTooLong);
        require!(
            symbol.as_bytes().len() <= MAX_SYMBOL_LEN,
            MintError::SymbolTooLong
        );

        let collection_state = &mut ctx.accounts.collection_state;
        collection_state.authority = ctx.accounts.initializer.key();
        collection_state.mint_count = 0;
        collection_state.bump = ctx.bumps.collection_state;
        collection_state.name = name;
        collection_state.symbol = symbol;

        Ok(())
    }

    pub fn register_mint(ctx: Context<RegisterMint>, name: String, uri: String) -> Result<()> {
        require!(!name.trim().is_empty(), MintError::NameRequired);
        require!(name.as_bytes().len() <= MAX_NAME_LEN, MintError::NameTooLong);
        require!(!uri.trim().is_empty(), MintError::UriRequired);
        require!(uri.as_bytes().len() <= MAX_URI_LEN, MintError::UriTooLong);

        let collection_state = &mut ctx.accounts.collection_state;
        let mint_receipt = &mut ctx.accounts.mint_receipt;

        mint_receipt.authority = collection_state.authority;
        mint_receipt.owner = ctx.accounts.owner.key();
        mint_receipt.mint = ctx.accounts.mint.key();
        mint_receipt.uri = uri;
        mint_receipt.name = name;
        mint_receipt.minted_at = Clock::get()?.unix_timestamp;
        mint_receipt.bump = ctx.bumps.mint_receipt;

        collection_state.mint_count = collection_state
            .mint_count
            .checked_add(1)
            .ok_or(MintError::MintOverflow)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(
        init,
        payer = initializer,
        seeds = [b"collection-state"],
        bump,
        space = CollectionState::SPACE
    )]
    pub collection_state: Account<'info, CollectionState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMint<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"collection-state"],
        bump = collection_state.bump
    )]
    pub collection_state: Account<'info, CollectionState>,
    #[account(
        init,
        payer = owner,
        seeds = [b"mint-receipt", mint.key().as_ref()],
        bump,
        space = MintReceipt::SPACE
    )]
    pub mint_receipt: Account<'info, MintReceipt>,
    /// CHECK: The client creates and initializes the mint account before this instruction.
    pub mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct CollectionState {
    pub authority: Pubkey,
    pub mint_count: u64,
    pub bump: u8,
    pub name: String,
    pub symbol: String,
}

impl CollectionState {
    pub const SPACE: usize = 8 + 32 + 8 + 1 + 4 + MAX_NAME_LEN + 4 + MAX_SYMBOL_LEN;
}

#[account]
pub struct MintReceipt {
    pub authority: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub uri: String,
    pub name: String,
    pub minted_at: i64,
    pub bump: u8,
}

impl MintReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 4 + MAX_URI_LEN + 4 + MAX_NAME_LEN + 8 + 1;
}

#[error_code]
pub enum MintError {
    #[msg("NFT name is required.")]
    NameRequired,
    #[msg("Metadata URI is required.")]
    UriRequired,
    #[msg("NFT name exceeds the allowed size.")]
    NameTooLong,
    #[msg("Collection symbol exceeds the allowed size.")]
    SymbolTooLong,
    #[msg("Metadata URI exceeds the allowed size.")]
    UriTooLong,
    #[msg("Mint counter overflowed.")]
    MintOverflow,
}

