import { act } from "@testing-library/react";
import { useTourStore } from "@/lib/store/tourStore";

describe("tourStore", () => {
  beforeEach(() => {
    act(() => useTourStore.getState().closeTour());
  });

  it("is closed by default", () => {
    expect(useTourStore.getState().isOpen).toBe(false);
  });

  it("openTour() opens the tour", () => {
    act(() => useTourStore.getState().openTour());
    expect(useTourStore.getState().isOpen).toBe(true);
  });

  it("closeTour() closes the tour", () => {
    act(() => useTourStore.getState().openTour());
    act(() => useTourStore.getState().closeTour());
    expect(useTourStore.getState().isOpen).toBe(false);
  });

  it("setOpen() reflects the passed value", () => {
    act(() => useTourStore.getState().setOpen(true));
    expect(useTourStore.getState().isOpen).toBe(true);
    act(() => useTourStore.getState().setOpen(false));
    expect(useTourStore.getState().isOpen).toBe(false);
  });
});
