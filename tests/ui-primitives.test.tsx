import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/components/ui/Overlay'
import { Tabs } from '../src/components/ui/Tabs'
import { WordSpan } from '../src/components/WordSpan/WordSpan'

describe('reusable interface primitives', () => {
  it('supports keyboard navigation between RTL tabs', () => {
    const onChange = vi.fn()
    render(
      <div dir="rtl">
        <Tabs
          label="أقسام الفهرس"
          items={[
            { id: 'surahs', label: 'السور' },
            { id: 'pages', label: 'الصفحات' },
          ]}
          value="surahs"
          onChange={onChange}
        />
      </div>,
    )

    const selectedTab = screen.getByRole('tab', { name: 'السور' })
    fireEvent.keyDown(selectedTab, { key: 'ArrowLeft' })

    expect(onChange).toHaveBeenCalledWith('pages')
    expect(screen.getByRole('tab', { name: 'الصفحات' })).toHaveFocus()
  })

  it('makes selectable mushaf glyphs keyboard accessible without changing the glyph', () => {
    const onSelect = vi.fn()
    render(
      <WordSpan
        id="1:1:1"
        glyph={'\ue001'}
        verseKey="1:1"
        isEnd={false}
        fontFamily="QCF_P001"
        selected={false}
        onSelect={onSelect}
      />,
    )

    const word = screen.getByRole('button')
    expect(word).toHaveTextContent('\ue001')
    fireEvent.keyDown(word, { key: 'Enter' })
    fireEvent.keyDown(word, { key: ' ' })

    expect(onSelect).toHaveBeenNthCalledWith(1, '1:1:1', '1:1')
    expect(onSelect).toHaveBeenNthCalledWith(2, '1:1:1', '1:1')
  })

  it('traps an open dialog semantically and restores focus after Escape', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'فتح'
    document.body.appendChild(trigger)
    trigger.focus()

    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    function Harness() {
      const [open, setOpen] = useState(true)
      return open ? (
        <Dialog title="الإعدادات" onClose={() => setOpen(false)}>
          <button type="button" data-autofocus>
            حفظ
          </button>
        </Dialog>
      ) : null
    }

    const view = render(<Harness />, { container: root })
    const dialog = screen.getByRole('dialog', { name: 'الإعدادات' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(root).toHaveAttribute('inert')
    await waitFor(() => expect(screen.getByRole('button', { name: 'حفظ' })).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(root).not.toHaveAttribute('inert')

    view.unmount()
    root.remove()
    trigger.remove()
  })
})
