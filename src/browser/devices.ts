import type { Device } from '../model/scenario.js';
import { PINNED_CHROME_BUILD } from './chrome-version.js';

export interface DeviceProfile {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly mobile: boolean;
  readonly userAgent: string;
}

const MAJOR = PINNED_CHROME_BUILD.split('.')[0] ?? '';

/**
 * Pinned viewport + DPR (a mid-tier Android phone like Lighthouse's moto g power class) and real-browser UAs;
 * never "HeadlessChrome", which bot walls and analytics treat differently.
 */
export const DEVICE_PROFILES: Readonly<Record<Device, DeviceProfile>> = {
  mobile: {
    width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true,
    userAgent: `Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Mobile Safari/537.36`,
  },
  desktop: {
    width: 1350, height: 940, deviceScaleFactor: 1, mobile: false,
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36`,
  },
};

export interface NetworkProfile {
  readonly latencyMs: number;
  readonly downloadKbps: number;
  readonly uploadKbps: number;
}

/**
 * Fixed network profile so boot timing is comparable between runs; values of Lighthouse's mobile "slow 4G"
 * (150 ms RTT, 1.6 Mbps down, 750 Kbps up): https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md
 */
export const NETWORK_PROFILES: Readonly<Record<Device, NetworkProfile>> = {
  mobile: { latencyMs: 150, downloadKbps: 1638.4, uploadKbps: 750 },
  desktop: { latencyMs: 40, downloadKbps: 10240, uploadKbps: 10240 },
};
