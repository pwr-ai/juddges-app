from juddges_search.chains.models import DocumentRetrievalOutput
from juddges_search.chains.qa import chain
from loguru import logger
from rich.console import Console
from rich.table import Table
from tqdm import tqdm

# Initialize Rich console
console = Console()

# Example queries
queries = [
    "jakie wagi narkotykow uwazane sa za znaczne",
    "jakie sa ograniczenia wolnosci slowa w Polsce",
    "jak definiuje sie sztuczna inteligencje w prawie",
    "jakie sa przyklady uszczerbkow na zdrowiu wedlug prawa",
]

# Create a table to display results
table = Table(title="Query Results")
table.add_column("Query", justify="left", style="cyan", no_wrap=True)
table.add_column("Judgment IDs", justify="left", style="green")
table.add_column("Response", justify="left", style="magenta")

for query in tqdm(queries):
    response = chain.invoke(
        {
            "question": query,
            "chat_history": [],
        }
    )
    # Cast response to DocumentRetrievalOutput
    response = DocumentRetrievalOutput(**response)
    logger.info(f"Chain response for '{query}': {response}")
    document_ids = ", ".join(response.document_ids)
    table.add_row(query, document_ids, response.text)

# Display the table
console.print(table)
