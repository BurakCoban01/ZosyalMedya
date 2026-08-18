/**
 * Feed feature — components barrel.
 *
 * The feed page delegates async-state presentation + post presentation to
 * these focused components. The post-card (m3-post-card-core) owns the
 * domain-rich presentation: identity, metadata, content variants, discovery
 * reason, and long-text expansion. The composer + reaction-bar upgrade are
 * split into their own components by later M3 features.
 */
export * from './feed-mode-header.component';
export * from './feed-skeleton.component';
export * from './feed-empty-state.component';
export * from './feed-error-state.component';
export * from './post-card.component';
