const baseURL = process.env.BASE_URL || "https://comm-need-radar.vercel.app";
const preset = process.env.LIGHTHOUSE_PRESET || "desktop";
const isDesktop = preset === "desktop";

module.exports = {
  ci: {
    collect: {
      url: [`${baseURL.replace(/\/$/, "")}/`],
      numberOfRuns: 3,
      settings: {
        ...(isDesktop ? { preset: "desktop" } : {}),
        chromeFlags: "--no-sandbox --headless=new",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: isDesktop ? 0.8 : 0.7 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: `./test-results/lighthouse-${preset}`,
    },
  },
};
