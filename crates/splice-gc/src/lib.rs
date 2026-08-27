pub mod collector;
pub mod error;
pub mod policy;
pub mod report;

pub use collector::{collect_garbage, estimate_reclaimable};
pub use error::GcError;
pub use policy::RetentionPolicy;
pub use report::GcReport;
