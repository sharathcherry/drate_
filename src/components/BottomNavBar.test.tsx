import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNavBar } from './BottomNavBar';

describe('BottomNavBar Component', () => {
  it('renders all main navigation items', () => {
    // We wrap it in MemoryRouter because BottomNavBar uses <Link> and useLocation()
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <BottomNavBar />
      </MemoryRouter>
    );

    // Assert that text for nav labels exists
    expect(screen.getByText('Explore')).toBeDefined();
    expect(screen.getByText('Ratings')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
    expect(screen.getByText('Profile')).toBeDefined();
  });

  it('applies hidden classes when hidden prop is true', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/browse']}>
        <BottomNavBar hidden={true} />
      </MemoryRouter>
    );

    const navElement = container.querySelector('nav');
    expect(navElement?.className).toContain('opacity-0');
    expect(navElement?.className).toContain('pointer-events-none');
  });

  it('is visible when hidden prop is false', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/browse']}>
        <BottomNavBar hidden={false} />
      </MemoryRouter>
    );

    const navElement = container.querySelector('nav');
    expect(navElement?.className).toContain('opacity-100');
    expect(navElement?.className).not.toContain('opacity-0');
  });
});
