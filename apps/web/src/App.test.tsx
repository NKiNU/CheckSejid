import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { AppProvider } from './store';

const renderAt = (path: string) =>
  render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProvider>,
  );

beforeEach(() => localStorage.clear());

describe('community bulletin (ADR-008)', () => {
  it('opens on the bulletin with the pinned post first and no drafts', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Bulletin' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Gotong-royong bersihkan masjid');
    expect(screen.queryByText('Jadual imam bulan Disember')).not.toBeInTheDocument(); // draft
    expect(screen.queryByText('2027 intake open for ages 7 to 12')).not.toBeInTheDocument(); // not followed
  });

  it('filters by kind', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Classes' }));
    expect(screen.getByText('Kelas Fardu Ain dewasa')).toBeInTheDocument();
    expect(screen.queryByText('Food bank opening hours')).not.toBeInTheDocument();
  });

  it('switches the interface to Bahasa Melayu', async () => {
    renderAt('/me');
    await userEvent.click(screen.getByRole('button', { name: 'BM' }));
    expect(screen.getByRole('link', { name: /Buletin/ })).toBeInTheDocument();
  });
});

describe('workspace', () => {
  it('publishes a post that then leads the community bulletin when pinned', async () => {
    renderAt('/workspace/bulletin');
    const form = screen.getByRole('heading', { name: 'New post' }).parentElement!;
    await userEvent.type(within(form).getByLabelText('Title'), 'Kuliah Subuh Ahad');
    await userEvent.click(within(form).getByRole('button', { name: 'Publish' }));
    expect(screen.getByText(/Published\. Followers see it/)).toBeInTheDocument();
    const card = screen.getByRole('heading', { level: 3, name: 'Kuliah Subuh Ahad' }).closest('article')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Pin to top' }));
    expect(within(card).getByText('Pinned')).toBeInTheDocument();
  });

  it('hides posting from roles without bulletin.publish', async () => {
    renderAt('/workspace/bulletin');
    await userEvent.selectOptions(screen.getAllByLabelText('Preview as role')[0], 'treasurer');
    const form = screen.getByRole('heading', { name: 'New post' }).parentElement!;
    expect(within(form).getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('blocks self-approval and lets another record be approved with an audit entry', async () => {
    renderAt('/workspace/finance?record=EXP-0143');
    expect(screen.getByText(/You created this record/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Sound system repair/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const detail = screen.getByRole('complementary', { name: 'Record detail' });
    expect(within(detail).getByText(/is approved and locked/)).toBeInTheDocument();
    expect(within(detail).getByRole('status')).toHaveTextContent('Approved. The record is now locked.');
    expect(within(detail).getAllByText('Approved').length).toBeGreaterThan(1); // badge + audit entry
  });

  it('validates new financial records', async () => {
    renderAt('/workspace/finance');
    await userEvent.click(screen.getByRole('button', { name: '+ Record expense' }));
    await userEvent.type(screen.getByLabelText('Description'), 'Lampu');
    await userEvent.type(screen.getByLabelText('Amount (MYR)'), '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at most two decimals/);
  });
});
