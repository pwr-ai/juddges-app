# How to Use Checkpoint/Resume in Ingestion Script

This guide explains how to use the enhanced checkpoint and resume features in the judgment ingestion script.

## Overview

The enhanced `ingest_judgments.py` script now supports:

- **Checkpoint/Resume**: Automatically save progress and resume from interruptions
- **Batch Processing**: Process documents in configurable batches with progress tracking
- **Retry Logic**: Automatic retry with exponential backoff for API failures
- **Deduplication**: Skip documents that already exist in the database
- **Progress Tracking**: Rich progress bars and detailed statistics
- **Graceful Shutdown**: Save checkpoint on Ctrl+C interruption

## Quick Start

### Basic Usage with Checkpoints

```bash
# Start ingestion (can be interrupted safely)
python ingest_judgments.py --polish 3000 --uk 3000 --batch-size 100

# If interrupted, resume from where it left off
python ingest_judgments.py --polish 3000 --uk 3000 --resume
```

### Command Line Options

```bash
# All available options
python ingest_judgments.py \
    --polish 3000 \
    --uk 3000 \
    --batch-size 50 \
    --resume \
    --no-embeddings
```

| Option | Description | Default |
|--------|-------------|---------|
| `--polish N` | Number of Polish judgments to ingest | 0 |
| `--uk N` | Number of UK judgments to ingest | 0 |
| `--batch-size N` | Documents per batch | 50 |
| `--resume` | Resume from last checkpoint | false |
| `--no-embeddings` | Skip generating embeddings | false |
| `--skip-polish` | Skip Polish dataset entirely | false |
| `--skip-uk` | Skip UK dataset entirely | false |

## Checkpoint System

### How Checkpoints Work

The script automatically saves checkpoints containing:

- Dataset being processed (polish/uk)
- Last processed document index
- Processing statistics (success/errors/duplicates)
- Batch configuration
- Timestamps

### Checkpoint File Location

```
scripts/.ingest_checkpoint.json
```

### Checkpoint File Format

```json
{
  "dataset": "polish",
  "last_processed_index": 2500,
  "total_processed": 2450,
  "started_at": "2026-03-18T10:00:00",
  "updated_at": "2026-03-18T10:45:00",
  "batch_size": 50,
  "stats": {
    "processed": 2450,
    "duplicates_skipped": 25,
    "errors": 25,
    "start_time": "2026-03-18T10:00:00"
  }
}
```

## Workflow Examples

### Large-Scale Ingestion

```bash
# 1. Start large ingestion
python ingest_judgments.py --polish 6000 --uk 3000 --batch-size 100

# 2. If process is interrupted (network issues, system restart, etc.)
#    Just run the same command with --resume
python ingest_judgments.py --polish 6000 --uk 3000 --batch-size 100 --resume

# 3. Process will continue from last checkpoint
```

### Development/Testing

```bash
# Small test run
python ingest_judgments.py --polish 10 --uk 10 --batch-size 5

# Resume if needed
python ingest_judgments.py --polish 10 --uk 10 --resume
```

### Production Deployment

```bash
# Production ingestion with embedding generation
python ingest_judgments.py \
    --polish 3000 \
    --uk 3000 \
    --batch-size 50 \
    --resume  # Always safe to include

# Skip embeddings for faster processing
python ingest_judgments.py \
    --polish 3000 \
    --uk 3000 \
    --batch-size 100 \
    --no-embeddings \
    --resume
```

## Error Handling & Recovery

### Automatic Retry

The script automatically retries failed operations:

- **API calls**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Database operations**: Automatic retry with backoff
- **Embedding generation**: Graceful fallback on service unavailability

### Manual Recovery

If the process fails repeatedly:

1. **Check logs**: Look at `ingest_judgments.log` for detailed errors
2. **Verify environment**: Ensure all required environment variables are set
3. **Check services**: Verify Supabase and embedding services are accessible
4. **Resume safely**: Use `--resume` flag to continue from last checkpoint

### Force Restart

To start completely fresh:

```bash
# Remove checkpoint file
rm scripts/.ingest_checkpoint.json

# Start fresh ingestion
python ingest_judgments.py --polish 3000 --uk 3000
```

## Performance Tuning

### Batch Size Guidelines

| Use Case | Recommended Batch Size | Notes |
|----------|------------------------|-------|
| Development | 10-20 | Fast feedback, easy debugging |
| Testing | 50 | Good balance of speed and control |
| Production | 100-200 | Optimal throughput for most systems |
| High-memory systems | 500+ | If you have abundant RAM |

### Optimization Tips

```bash
# Fast processing without embeddings
python ingest_judgments.py --polish 3000 --batch-size 200 --no-embeddings

# Memory-conscious processing
python ingest_judgments.py --polish 3000 --batch-size 25

# Balanced approach
python ingest_judgments.py --polish 3000 --batch-size 100
```

## Monitoring Progress

### Progress Indicators

The script provides real-time feedback:

- **Rich progress bars**: Visual progress for each dataset
- **Live statistics**: Documents processed, errors, duplicates
- **Processing rate**: Documents per second
- **Estimated time**: Based on current processing speed

### Log Files

```bash
# View real-time logs
tail -f ingest_judgments.log

# Search for errors
grep ERROR ingest_judgments.log

# Check specific case processing
grep "CASE-123" ingest_judgments.log
```

## Troubleshooting

### Common Issues

#### 1. Checkpoint Not Found
```
Error: No checkpoint found
```
**Solution**: Don't use `--resume` on first run or if checkpoint was cleared.

#### 2. Database Connection Errors
```
Error: Failed to insert judgment
```
**Solution**: Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.

#### 3. Memory Issues with Large Batches
```
Error: Memory allocation failed
```
**Solution**: Reduce `--batch-size` to 25-50.

#### 4. Embedding Service Unavailable
```
Warning: Failed to generate embedding
```
**Solution**: Use `--no-embeddings` or fix the embedding service.

### Getting Help

```bash
# View all options
python ingest_judgments.py --help

# Test checkpoint functionality
python test_checkpoint.py

# Run demo
python demo_checkpoint.py
```

## Best Practices

1. **Always use --resume**: It's safe to include even on first run
2. **Monitor logs**: Keep an eye on `ingest_judgments.log` for issues
3. **Test batch sizes**: Find optimal batch size for your system
4. **Handle interruptions gracefully**: Use Ctrl+C, don't kill the process
5. **Verify environment**: Ensure all required services are running
6. **Regular checkpoints**: Let the script save progress naturally
7. **Cleanup on completion**: Checkpoint files are auto-removed on success

## Environment Variables

Required:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Optional:
```env
TRANSFORMERS_INFERENCE_URL=http://localhost:8080  # For embeddings
```

## Integration with Docker

```bash
# Run in container with volume mount for persistence
docker run -it --rm \
  -v $(pwd)/scripts:/app/scripts \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  python:3.12 \
  bash -c "cd /app/scripts && pip install -r requirements.txt && python ingest_judgments.py --polish 100 --resume"
```

The checkpoint file persists in the mounted volume, allowing seamless resume across container restarts.