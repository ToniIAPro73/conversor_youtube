export const WEB_TOOL_LIMITS = {
  image: {
    maxFiles: 50,
    maxBytesPerFile: 25 * 1024 * 1024,
    maxTotalBytes: 150 * 1024 * 1024,
    maxPixelsPerImage: 40_000_000,
    concurrency: 2,
  },
  pdf: {
    maxFiles: 10,
    maxBytesPerFile: 50 * 1024 * 1024,
    maxTotalBytes: 200 * 1024 * 1024,
    maxTotalPages: 300,
    thumbnailConcurrency: 2,
  },
} as const;

export function getConservativeImageLimits(deviceMemory?: number) {
  if (deviceMemory !== undefined && deviceMemory <= 4) {
    return {
      ...WEB_TOOL_LIMITS.image,
      maxFiles: 20,
      maxTotalBytes: 80 * 1024 * 1024,
      maxPixelsPerImage: 24_000_000,
    };
  }
  return WEB_TOOL_LIMITS.image;
}
