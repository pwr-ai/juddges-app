/** @jest-environment node */

import { renderToString } from "react-dom/server";
import React from "react";

// Mock next/navigation for server-side evaluation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/about",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock lucide-react icons
jest.mock("lucide-react", () => {
  const React = require("react");
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        return (props: any) => React.createElement("svg", { ...props, "data-icon": prop });
      },
    }
  );
});

// Mock AuthContext
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
  }),
}));

describe("Public Routes Server Side Rendering Contract", () => {
  it("AboutPage component renders meaningful text content without client auth blocking", async () => {
    const AboutPage = (await import("@/app/about/page")).default;
    const html = renderToString(React.createElement(AboutPage));

    expect(html).toContain("About JuDDGES");
    expect(html).toContain("Wrocław University of Science and Technology");
    expect(html).not.toContain("Initializing application");
  });

  it("EcosystemPage component renders meaningful text content on initial render", async () => {
    const EcosystemPage = (await import("@/app/ecosystem/page")).default;
    const html = renderToString(React.createElement(EcosystemPage));

    expect(html).toContain("JuDDGES");
    expect(html).toContain("Hugging Face");
    expect(html).not.toContain("Initializing application");
  });
});
