//! Step 1.2 spikes — proofs-of-concept gated to test builds (not in prod binary).
//! Each spike validates one risky assumption from PLAN-v0.0.1.md L402-410.
//! Run with: `cargo test --tests --ignored -- spike_<x> --nocapture`

pub mod spike_a_worktree;
pub mod spike_b_sqlite;
pub mod spike_c_claude_cli;
pub mod spike_d_specta;
pub mod spike_e_pty;
