import { render } from "@testing-library/react";

import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { track } from "@/lib/analytics/track";

let mockPathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
jest.mock("@/lib/analytics/track", () => ({
  track: jest.fn(),
}));

const mockTrack = track as jest.MockedFunction<typeof track>;

describe("PageViewTracker", () => {
  beforeEach(() => {
    mockTrack.mockReset();
    mockPathname = "/";
  });

  it("tracks the normalized route on mount", () => {
    mockPathname = "/documents/II_K_123_2020";
    render(<PageViewTracker />);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("page_viewed", {
      route: "/documents/[id]",
    });
  });

  it("tracks each navigation once, not each re-render", () => {
    const { rerender } = render(<PageViewTracker />);
    rerender(<PageViewTracker />);
    expect(mockTrack).toHaveBeenCalledTimes(1);

    mockPathname = "/search";
    rerender(<PageViewTracker />);
    expect(mockTrack).toHaveBeenCalledTimes(2);
    expect(mockTrack).toHaveBeenLastCalledWith("page_viewed", {
      route: "/search",
    });
  });

  it("renders nothing", () => {
    const { container } = render(<PageViewTracker />);
    expect(container).toBeEmptyDOMElement();
  });
});
