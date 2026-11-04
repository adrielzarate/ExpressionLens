import { memo, useMemo } from 'react'
import type { ExpressionTimeline, TimelineCategory } from '../lib/timeline'
import { categoryPresentation } from '../lib/presentation'

// At most eight paths, regardless of sample count. Each path contains all
// same-category rectangles; native SVG renders the compact overview once.
export const TimelineOverview = memo(function TimelineOverview({
  timeline,
}: {
  timeline: ExpressionTimeline
}) {
  const paths = useMemo(() => {
    const result = new Map<TimelineCategory, string[]>()
    for (const interval of timeline.intervals) {
      const start = (interval.startMs / timeline.durationMs) * 1000
      const end = (interval.endMs / timeline.durationMs) * 1000
      const commands = result.get(interval.category) ?? []
      commands.push(`M${start} 0H${end}V48H${start}Z`)
      result.set(interval.category, commands)
    }
    return [...result].map(([category, commands]) => ({ category, d: commands.join('') }))
  }, [timeline])
  return (
    <svg
      className="timeline-overview"
      viewBox="0 0 1000 48"
      preserveAspectRatio="none"
      role="img"
      aria-label="Expression segments colored by the legend. Hover or focus the timeline for prediction details."
    >
      {paths.map(({ category, d }) => (
        <path key={category} d={d} fill={categoryPresentation[category].color} />
      ))}
    </svg>
  )
})
