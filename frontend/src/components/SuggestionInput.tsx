import { useEffect, useMemo, useRef, useState } from 'react'

export type SuggestionOption = {
  value: string
  title?: string
  description?: string
  meta?: string
  searchTerms?: string[]
}

type SuggestionInputProps = {
  value: string
  onChange: (value: string) => void
  suggestions: Array<string | SuggestionOption>
  optionLayout?: 'stacked' | 'inline'
  placeholder?: string
  inputClassName?: string
  panelClassName?: string
  optionClassName?: string
  emptyStateClassName?: string
  emptyText?: string
}

function normalizeSuggestion(value: string) {
  return value.trim().toLocaleLowerCase('ar')
}

function toSuggestionOption(input: string | SuggestionOption): SuggestionOption {
  return typeof input === 'string'
    ? { value: input, title: input }
    : {
        ...input,
        title: input.title ?? input.value,
      }
}

function toSearchableText(option: SuggestionOption) {
  return normalizeSuggestion([
    option.value,
    option.title,
    option.description,
    option.meta,
    ...(option.searchTerms ?? []),
  ].filter(Boolean).join(' '))
}

export function SuggestionInput({
  value,
  onChange,
  suggestions,
  optionLayout = 'stacked',
  placeholder,
  inputClassName,
  panelClassName,
  optionClassName,
  emptyStateClassName,
  emptyText = 'لا توجد اقتراحات مطابقة.',
}: SuggestionInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const normalizedOptions = useMemo(() => {
    const uniqueOptions = new Map<string, SuggestionOption>()

    for (const suggestion of suggestions) {
      const option = toSuggestionOption(suggestion)
      const normalizedKey = normalizeSuggestion(option.value)

      if (!normalizedKey || uniqueOptions.has(normalizedKey)) {
        continue
      }

      uniqueOptions.set(normalizedKey, option)
    }

    return Array.from(uniqueOptions.values())
  }, [suggestions])

  const filteredOptions = useMemo(() => {
    if (!value.trim()) {
      return normalizedOptions.slice(0, 8)
    }

    const normalizedValue = normalizeSuggestion(value)
    const startsWithMatches = normalizedOptions.filter((option) => normalizeSuggestion(option.value).startsWith(normalizedValue))
    const containsMatches = normalizedOptions.filter((option) => {
      const searchableText = toSearchableText(option)
      return !normalizeSuggestion(option.value).startsWith(normalizedValue) && searchableText.includes(normalizedValue)
    })

    return [...startsWithMatches, ...containsMatches].slice(0, 8)
  }, [normalizedOptions, value])

  useEffect(() => {
    if (!filteredOptions.length) {
      setActiveIndex(-1)
      return
    }

    setActiveIndex((current) => {
      if (current < 0) {
        return 0
      }

      return Math.min(current, filteredOptions.length - 1)
    })
  }, [filteredOptions])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function selectSuggestion(nextValue: string) {
    onChange(nextValue)
    setIsOpen(false)
  }

  return (
    <div className="relative mt-2" ref={containerRef}>
      <input
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setIsOpen(true)
            setActiveIndex((current) => {
              if (!filteredOptions.length) {
                return -1
              }

              return current >= filteredOptions.length - 1 ? 0 : current + 1
            })
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setIsOpen(true)
            setActiveIndex((current) => {
              if (!filteredOptions.length) {
                return -1
              }

              return current <= 0 ? filteredOptions.length - 1 : current - 1
            })
          }

          if (event.key === 'Enter' && isOpen && activeIndex >= 0 && filteredOptions[activeIndex]) {
            event.preventDefault()
            selectSuggestion(filteredOptions[activeIndex].value)
          }

          if (event.key === 'Escape') {
            setIsOpen(false)
          }
        }}
      />

      {isOpen ? (
        <div className={panelClassName}>
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => {
              const isActive = index === activeIndex

              return (
                <button
                  key={option.value}
                  className={`${optionClassName ?? ''} ${isActive ? 'bg-teal-500/20 text-teal-100' : ''}`.trim()}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectSuggestion(option.value)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {optionLayout === 'inline' ? (
                    <span className="flex items-center justify-between gap-3 text-right">
                      <span className="min-w-0 truncate font-black">{option.title ?? option.value}</span>
                      <span className="shrink-0 text-[11px] font-black tracking-[0.08em] text-teal-200/90">
                        {option.meta ?? option.description ?? ''}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="block font-black">{option.title ?? option.value}</span>
                      {option.description ? (
                        <span className="mt-1 block text-xs font-bold text-stone-300">{option.description}</span>
                      ) : null}
                      {option.meta ? (
                        <span className="mt-1 block text-[11px] font-black tracking-[0.12em] text-teal-200/90">{option.meta}</span>
                      ) : null}
                    </>
                  )}
                </button>
              )
            })
          ) : value.trim() ? (
            <div className={emptyStateClassName}>{emptyText}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}