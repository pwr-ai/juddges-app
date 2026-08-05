import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EmbeddingModelsSection } from "@/app/settings/page";

const modelsResponse = {
  models: [
    {
      id: "tei/bge-m3",
      provider: "tei",
      model_name: "BAAI/bge-m3",
      dimensions: 1024,
      max_input_length: 8192,
      description: "Multilingual embeddings",
      is_default: true,
      is_active: false,
      api_key_configured: true,
    },
  ],
  active_model_id: "other/model",
};

describe("EmbeddingModelsSection role policy", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => modelsResponse,
    });
  });

  it("does not expose the global activation control to a non-admin", async () => {
    render(<EmbeddingModelsSection isAdmin={false} />);

    expect(await screen.findByText("BAAI/bge-m3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
    expect(screen.getByText(/Only administrators can change/)).toBeInTheDocument();
  });

  it("allows an admin to activate an allowed model", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => modelsResponse })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model_id: "tei/bge-m3" }),
      });

    render(<EmbeddingModelsSection isAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/embeddings?action=set-active",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
