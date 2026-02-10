'use client';

import { useEffect, useState } from 'react';
import { ExtractionSchema } from '@/types/extraction_schemas';
import hljs from 'highlight.js/lib/core';
import yaml from 'highlight.js/lib/languages/yaml';
import json from 'highlight.js/lib/languages/json';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/vs2015.css';
import YAML from 'yaml';

// Register languages
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);

interface CodeBlockProps {
  code: string;
  language: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState('');

  useEffect(() => {
    if (!code || code.trim() === '') {
      setHighlighted('');
      return;
    }
    try {
      const result = hljs.highlight(code, { language });
      // Sanitize hljs output to prevent XSS from malicious schema data
      const sanitized = DOMPurify.sanitize(result.value, {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['class'],
      });
      setHighlighted(sanitized);
    } catch (error) {
      console.error('Highlight error:', error);
      // Escape plain text fallback
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      setHighlighted(escaped);
    }
  }, [code, language]);

  if (!code || code.trim() === '') {
    return <div className="text-gray-400 italic">No content</div>;
  }

  return (
    <pre className="hljs" style={{ margin: 0, padding: 0, backgroundColor: 'transparent' }}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}

export default function ExtractionSchemaList() {
  const [schemas, setSchemas] = useState<ExtractionSchema[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchemas = async () => {
    try {
      const response = await fetch('/api/schemas');
      if (!response.ok) {
        throw new Error('Failed to fetch extraction schemas');
      }
      const data = await response.json();
      setSchemas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchemas();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/schemas?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete schema');
      }

      await fetchSchemas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <div>Loading extraction schemas...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Extraction Schemas</h1>
      <div className="space-y-4">
        {schemas.map((schema) => (
          <div
            key={schema.id}
            className="p-4 border rounded hover:bg-gray-50"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold mb-2">{schema.name}</h2>
                <p className="text-gray-600 mb-2">{schema.description}</p>
                <div className="flex gap-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                    {schema.type}
                  </span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                    {schema.category}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(schema.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>

            <div className="mt-3">
              <h3 className="font-medium mb-1">Schema Definition:</h3>
              <div className="bg-gray-100 p-3 rounded overflow-auto text-sm max-h-96">
                <CodeBlock
                  code={schema.text ? YAML.stringify(schema.text) : ''}
                  language="yaml"
                />
              </div>
            </div>

            {schema.dates && Object.keys(schema.dates).length > 0 && (
              <div className="mt-3">
                <h3 className="font-medium mb-1">Dates:</h3>
                <ul className="space-y-1">
                  {Object.entries(schema.dates).map(([key, value]) => (
                    <li key={key} className="flex items-center gap-2">
                      <span className="font-medium">{key}:</span>
                      <span>{value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 text-sm text-gray-500">
              <span>Created: {formatDate(schema.created_at)}</span>
              {schema.updated_at && (
                <>
                  <span className="mx-2">•</span>
                  <span>Updated: {formatDate(schema.updated_at)}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
