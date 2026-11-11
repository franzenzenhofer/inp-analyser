import { domSize, measurementArtifact, pageExceptions, unexplainedTime } from './rules/context.js';
import { longTaskInputDelay, missingViewport, thirdPartyInputDelay } from './rules/input-delay.js';
import { largeDomChange, largeLayout, largeStyleRecalc, nonCompositedAnimation, postHandlerScript, renderingDominant } from './rules/presentation.js';
import { forcedReflow, layoutThrashing, slowHandler, thirdPartyInDispatch } from './rules/processing.js';
import type { Rule } from './types.js';

export const ALL_RULES: readonly Rule[] = [
  longTaskInputDelay, thirdPartyInputDelay, missingViewport,
  slowHandler, thirdPartyInDispatch, forcedReflow, layoutThrashing,
  largeStyleRecalc, largeLayout, postHandlerScript, renderingDominant, largeDomChange, nonCompositedAnimation,
  domSize, measurementArtifact, pageExceptions, unexplainedTime,
];
