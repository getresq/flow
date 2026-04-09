export function sortIndicator(direction: false | 'asc' | 'desc') {
  if (direction === 'asc') return '↑'
  if (direction === 'desc') return '↓'
  return ''
}
