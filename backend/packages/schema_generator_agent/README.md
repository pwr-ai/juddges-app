# Schema Generator Agent

## Running example scripts

You need to set the following environment variables with credentials to OpenAI-like API. You can just put it in the `.env` file, it will be automatically loaded by the scripts.

```bash
SELFHOSTED_API_KEY=
SELFHOSTED_API_URL=
```

## Running tests 

From the root of the repository, run:

```bash
make -C backend/packages/schema_generator_agent all
```
