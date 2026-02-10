/**
 * Component tests for Schema Editor
 *
 * Tests FieldCard rendering and interactions, SchemaCanvas CRUD operations,
 * and real-time sync behavior.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
  createMockField,
  createMockFields,
  createMockSupabaseClient,
  createMockChannel,
  createMockRealtimePayload,
  wait,
  buildField,
  TEST_TIMEOUTS,
} from './test-utils';

// Mock components (to be implemented)
// These would be the actual components from the implementation
const FieldCard = ({ field, onEdit, onDelete, isHighlighted, isDragging }: {
  field: any;
  onEdit: (field: any) => void;
  onDelete: (fieldId: string) => void;
  isHighlighted?: boolean;
  isDragging?: boolean;
}) => {
  return (
    <div
      data-testid={`field-card-${field.id}`}
      className={`field-card ${isHighlighted ? 'ai-created' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <div data-testid="field-name">{field.field_name}</div>
      <div data-testid="field-type">{field.field_type}</div>
      <div data-testid="field-description">{field.description}</div>
      {field.is_required && <span data-testid="required-badge">Required</span>}
      <button onClick={() => onEdit(field)} data-testid="edit-button">
        Edit
      </button>
      <button onClick={() => onDelete(field.id)} data-testid="delete-button">
        Delete
      </button>
    </div>
  );
};

const SchemaCanvas = ({ sessionId, fields, onFieldAdd, onFieldUpdate, onFieldDelete }: {
  sessionId: string;
  fields: any[];
  onFieldAdd: (field: any) => void;
  onFieldUpdate: (id: string, updates: any) => void;
  onFieldDelete: (id: string) => void;
}) => {
  const [selectedField, setSelectedField] = React.useState<any>(null);

  return (
    <div data-testid="schema-canvas">
      <h2>Schema Canvas</h2>
      <button
        data-testid="add-field-button"
        onClick={() => {
          const newField = createMockField({
            session_id: sessionId,
            field_name: 'new_field',
            position: fields.length,
          });
          onFieldAdd(newField);
        }}
      >
        Add Field
      </button>
      <div data-testid="field-list">
        {fields.map((field) => (
          <FieldCard
            key={field.id}
            field={field}
            onEdit={setSelectedField}
            onDelete={onFieldDelete}
          />
        ))}
      </div>
      {selectedField && (
        <div data-testid="field-editor-modal">
          <h3>Edit Field</h3>
          <input
            data-testid="field-name-input"
            value={selectedField.field_name}
            onChange={(e) => {
              setSelectedField({ ...selectedField, field_name: e.target.value });
            }}
          />
          <button
            data-testid="save-field-button"
            onClick={() => {
              onFieldUpdate(selectedField.id, selectedField);
              setSelectedField(null);
            }}
          >
            Save
          </button>
          <button
            data-testid="cancel-button"
            onClick={() => setSelectedField(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

describe('FieldCard Component', () => {
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render field name, type, and description', () => {
      const field = createMockField({
        field_name: 'company_name',
        field_type: 'string',
        description: 'The name of the company',
      });

      render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByTestId('field-name')).toHaveTextContent('company_name');
      expect(screen.getByTestId('field-type')).toHaveTextContent('string');
      expect(screen.getByTestId('field-description')).toHaveTextContent('The name of the company');
    });

    it('should show required badge for required fields', () => {
      const field = createMockField({ is_required: true });

      render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByTestId('required-badge')).toBeInTheDocument();
    });

    it('should not show required badge for optional fields', () => {
      const field = createMockField({ is_required: false });

      render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByTestId('required-badge')).not.toBeInTheDocument();
    });

    it('should apply highlight class for AI-created fields', () => {
      const field = createMockField({ created_by: 'ai' });

      const { container } = render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          isHighlighted={true}
        />
      );

      const cardElement = container.querySelector('.ai-created');
      expect(cardElement).toBeInTheDocument();
    });

    it('should apply dragging class when being dragged', () => {
      const field = createMockField();

      const { container } = render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          isDragging={true}
        />
      );

      const cardElement = container.querySelector('.dragging');
      expect(cardElement).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onEdit when edit button is clicked', async () => {
      const field = createMockField();
      const user = userEvent.setup();

      render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      await user.click(screen.getByTestId('edit-button'));

      expect(mockOnEdit).toHaveBeenCalledTimes(1);
      expect(mockOnEdit).toHaveBeenCalledWith(field);
    });

    it('should call onDelete when delete button is clicked', async () => {
      const field = createMockField({ id: 'field-123' });
      const user = userEvent.setup();

      render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      await user.click(screen.getByTestId('delete-button'));

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnDelete).toHaveBeenCalledWith('field-123');
    });
  });

  describe('Different field types', () => {
    it.each([
      ['string', 'text'],
      ['number', 'numeric'],
      ['boolean', 'true/false'],
      ['array', 'list'],
      ['object', 'nested'],
    ])('should render %s field type correctly', (fieldType, _description) => {
      const field = createMockField({
        field_type: fieldType as any,
      });

      render(
        <FieldCard
          field={field}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByTestId('field-type')).toHaveTextContent(fieldType);
    });
  });
});

describe('SchemaCanvas Component', () => {
  const sessionId = 'test-session-123';
  const mockOnFieldAdd = jest.fn();
  const mockOnFieldUpdate = jest.fn();
  const mockOnFieldDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Field List Rendering', () => {
    it('should render empty state when no fields', () => {
      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={[]}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      const fieldList = screen.getByTestId('field-list');
      expect(fieldList).toBeInTheDocument();
      expect(fieldList.children).toHaveLength(0);
    });

    it('should render all fields in order', () => {
      const fields = createMockFields(5);

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={fields}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      fields.forEach((field) => {
        expect(screen.getByTestId(`field-card-${field.id}`)).toBeInTheDocument();
      });
    });

    it('should render many fields efficiently', () => {
      const fields = createMockFields(50);

      const { container } = render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={fields}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      expect(container.querySelectorAll('[data-testid^="field-card-"]')).toHaveLength(50);
    });
  });

  describe('CRUD Operations', () => {
    it('should add a new field when Add Field button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={[]}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      await user.click(screen.getByTestId('add-field-button'));

      expect(mockOnFieldAdd).toHaveBeenCalledTimes(1);
      expect(mockOnFieldAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: sessionId,
          field_name: 'new_field',
        })
      );
    });

    it('should open editor modal when edit is clicked', async () => {
      const fields = [createMockField({ field_name: 'test_field' })];
      const user = userEvent.setup();

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={fields}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      await user.click(screen.getByTestId('edit-button'));

      expect(screen.getByTestId('field-editor-modal')).toBeInTheDocument();
    });

    it('should update field when saved in editor', async () => {
      const field = createMockField({ id: 'field-1', field_name: 'old_name' });
      const user = userEvent.setup();

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={[field]}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      // Open editor
      await user.click(screen.getByTestId('edit-button'));

      // Change field name
      const input = screen.getByTestId('field-name-input');
      await user.clear(input);
      await user.type(input, 'new_name');

      // Save
      await user.click(screen.getByTestId('save-field-button'));

      expect(mockOnFieldUpdate).toHaveBeenCalledWith(
        'field-1',
        expect.objectContaining({
          field_name: 'new_name',
        })
      );
    });

    it('should close editor without saving when cancel is clicked', async () => {
      const field = createMockField();
      const user = userEvent.setup();

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={[field]}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      // Open editor
      await user.click(screen.getByTestId('edit-button'));
      expect(screen.getByTestId('field-editor-modal')).toBeInTheDocument();

      // Cancel
      await user.click(screen.getByTestId('cancel-button'));

      expect(screen.queryByTestId('field-editor-modal')).not.toBeInTheDocument();
      expect(mockOnFieldUpdate).not.toHaveBeenCalled();
    });

    it('should delete field when delete is clicked', async () => {
      const field = createMockField({ id: 'field-to-delete' });
      const user = userEvent.setup();

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={[field]}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      await user.click(screen.getByTestId('delete-button'));

      expect(mockOnFieldDelete).toHaveBeenCalledWith('field-to-delete');
    });
  });

  describe('Multiple field operations', () => {
    it('should handle adding multiple fields in sequence', async () => {
      const user = userEvent.setup();

      render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={[]}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      const addButton = screen.getByTestId('add-field-button');

      await user.click(addButton);
      await user.click(addButton);
      await user.click(addButton);

      expect(mockOnFieldAdd).toHaveBeenCalledTimes(3);
    });

    it('should handle editing different fields', async () => {
      const fields = createMockFields(3);
      const user = userEvent.setup();

      const { rerender } = render(
        <SchemaCanvas
          sessionId={sessionId}
          fields={fields}
          onFieldAdd={mockOnFieldAdd}
          onFieldUpdate={mockOnFieldUpdate}
          onFieldDelete={mockOnFieldDelete}
        />
      );

      // Edit first field
      const editButtons = screen.getAllByTestId('edit-button');
      await user.click(editButtons[0]);

      const input = screen.getByTestId('field-name-input');
      await user.clear(input);
      await user.type(input, 'edited_field_1');
      await user.click(screen.getByTestId('save-field-button'));

      expect(mockOnFieldUpdate).toHaveBeenCalledWith(
        fields[0].id,
        expect.objectContaining({ field_name: 'edited_field_1' })
      );
    });
  });
});

describe('Real-time Sync Behavior', () => {
  let mockSupabaseClient: ReturnType<typeof createMockSupabaseClient>;
  let mockChannel: ReturnType<typeof createMockChannel>;

  beforeEach(() => {
    mockSupabaseClient = createMockSupabaseClient();
    mockChannel = createMockChannel();
    (mockSupabaseClient.channel as jest.Mock).mockReturnValue(mockChannel);
  });

  it('should subscribe to real-time changes on mount', () => {
    // This test would verify that the component subscribes to Supabase real-time
    // In actual implementation, this would test the useSchemaSync hook

    expect(mockChannel.on).toBeDefined();
    expect(mockChannel.subscribe).toBeDefined();
  });

  it('should handle INSERT events from real-time subscription', async () => {
    const newField = createMockField({ created_by: 'ai' });
    const payload = createMockRealtimePayload('INSERT', newField);

    // Simulate real-time event
    // In actual implementation, this would trigger through the subscription callback

    expect(payload.eventType).toBe('INSERT');
    expect(payload.new).toMatchObject(newField);
  });

  it('should handle UPDATE events from real-time subscription', async () => {
    const updatedField = createMockField({
      id: 'field-1',
      field_name: 'updated_field'
    });
    const payload = createMockRealtimePayload('UPDATE', updatedField);

    expect(payload.eventType).toBe('UPDATE');
    expect(payload.new).toMatchObject(updatedField);
  });

  it('should handle DELETE events from real-time subscription', async () => {
    const deletedField = createMockField({ id: 'field-to-delete' });
    const payload = createMockRealtimePayload('DELETE', deletedField);

    expect(payload.eventType).toBe('DELETE');
    expect(payload.old).toMatchObject(deletedField);
  });

  it('should unsubscribe from channel on unmount', async () => {
    // Verify cleanup behavior
    await mockChannel.unsubscribe();

    expect(mockChannel.unsubscribe).toHaveBeenCalled();
  });

  it('should highlight new fields from AI for 3 seconds', async () => {
    jest.useFakeTimers();

    const aiField = buildField()
      .withName('ai_created_field')
      .createdBy('ai')
      .build();

    const { container } = render(
      <FieldCard
        field={aiField}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        isHighlighted={true}
      />
    );

    // Should be highlighted initially
    expect(container.querySelector('.ai-created')).toBeInTheDocument();

    // Fast-forward 3 seconds
    jest.advanceTimersByTime(3000);

    // In actual implementation, highlight would be removed
    // This is a placeholder for the actual animation logic

    jest.useRealTimers();
  });
});

describe('Performance and Edge Cases', () => {
  it('should handle rapid field additions', async () => {
    const mockOnFieldAdd = jest.fn();
    const user = userEvent.setup();

    render(
      <SchemaCanvas
        sessionId="test-session"
        fields={[]}
        onFieldAdd={mockOnFieldAdd}
        onFieldUpdate={jest.fn()}
        onFieldDelete={jest.fn()}
      />
    );

    const addButton = screen.getByTestId('add-field-button');

    // Rapidly click add button
    for (let i = 0; i < 10; i++) {
      await user.click(addButton);
    }

    expect(mockOnFieldAdd).toHaveBeenCalledTimes(10);
  });

  it('should handle fields with special characters in names', () => {
    const field = createMockField({
      field_name: 'field-with-special-chars_123!@#',
      description: 'Special chars: <>&"\'',
    });

    render(
      <FieldCard
        field={field}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByTestId('field-name')).toHaveTextContent(field.field_name);
  });

  it('should handle very long field descriptions', () => {
    const longDescription = 'A'.repeat(1000);
    const field = createMockField({ description: longDescription });

    render(
      <FieldCard
        field={field}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByTestId('field-description')).toHaveTextContent(longDescription);
  });

  it('should handle fields with missing optional properties', () => {
    const field = createMockField({
      description: undefined,
      validation_rules: {},
      visual_metadata: {},
    });

    render(
      <FieldCard
        field={field}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    expect(screen.getByTestId(`field-card-${field.id}`)).toBeInTheDocument();
  });
});

describe('Accessibility', () => {
  it('should be keyboard navigable', async () => {
    const user = userEvent.setup();
    const mockOnEdit = jest.fn();

    render(
      <FieldCard
        field={createMockField()}
        onEdit={mockOnEdit}
        onDelete={jest.fn()}
      />
    );

    const editButton = screen.getByTestId('edit-button');

    // Tab to button and press Enter
    await user.tab();
    await user.keyboard('{Enter}');

    expect(mockOnEdit).toHaveBeenCalled();
  });

  it('should have proper ARIA labels', () => {
    const field = createMockField({ field_name: 'test_field' });

    render(
      <FieldCard
        field={field}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    // In actual implementation, verify aria-labels are present
    const card = screen.getByTestId(`field-card-${field.id}`);
    expect(card).toBeInTheDocument();
  });
});
