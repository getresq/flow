import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import * as ui from '../index';

describe('shadcn component smoke tests', () => {
  it('exports the planned primitives', () => {
    expect(ui.Button).toBeDefined();
    expect(ui.Badge).toBeDefined();
    expect(ui.Tabs).toBeDefined();
    expect(ui.Input).toBeDefined();
    expect(ui.Select).toBeDefined();
    expect(ui.DropdownMenu).toBeDefined();
    expect(ui.Tooltip).toBeDefined();
    expect(ui.ScrollArea).toBeDefined();
    expect(ui.Separator).toBeDefined();
    expect(ui.Card).toBeDefined();
    expect(ui.Sheet).toBeDefined();
    expect(ui.CommandDialog).toBeDefined();
    expect(ui.Table).toBeDefined();
    expect(ui.Toggle).toBeDefined();
  });

  it('renders representative primitives', () => {
    const { getByRole, getByText } = render(
      <div>
        <ui.Button>Click</ui.Button>
        <ui.Badge>Status</ui.Badge>
        <ui.Input placeholder="test" />
        <ui.Tabs defaultValue="overview">
          <ui.TabsList>
            <ui.TabsTrigger value="overview">Overview</ui.TabsTrigger>
          </ui.TabsList>
          <ui.TabsContent value="overview">Tab content</ui.TabsContent>
        </ui.Tabs>
        <ui.Separator />
        <ui.Card>
          <ui.CardHeader>
            <ui.CardTitle>Title</ui.CardTitle>
          </ui.CardHeader>
          <ui.CardContent>Content</ui.CardContent>
        </ui.Card>
        <ui.ScrollArea className="h-16">
          <div>Scrollable content</div>
        </ui.ScrollArea>
        <ui.Table>
          <ui.TableHeader>
            <ui.TableRow>
              <ui.TableHead>Column</ui.TableHead>
            </ui.TableRow>
          </ui.TableHeader>
          <ui.TableBody>
            <ui.TableRow>
              <ui.TableCell>Cell</ui.TableCell>
            </ui.TableRow>
          </ui.TableBody>
        </ui.Table>
        <ui.Toggle pressed>Toggle</ui.Toggle>
      </div>,
    );

    expect(getByRole('button', { name: 'Click' })).toHaveTextContent('Click');
    expect(getByText('Status')).toBeInTheDocument();
    expect(getByRole('textbox')).toBeInTheDocument();
    expect(getByText('Title')).toBeInTheDocument();
    expect(getByText('Content')).toBeInTheDocument();
    expect(getByText('Tab content')).toBeInTheDocument();
    expect(getByText('Cell')).toBeInTheDocument();
    expect(getByText('Toggle')).toBeInTheDocument();
  });
});
