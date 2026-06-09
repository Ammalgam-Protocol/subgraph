export function updateAt(arr: readonly bigint[], value: bigint, index: number): bigint[] {
  if (index < 0 || index >= arr.length) return [...arr]
  const copy = [...arr]
  copy[index] = value
  return copy
}

export function addAt(arr: readonly bigint[], value: bigint, index: number): bigint[] {
  const current = arr[index] ?? 0n
  return updateAt(arr, current + value, index)
}

export function subtractAt(arr: readonly bigint[], value: bigint, index: number): bigint[] {
  const current = arr[index] ?? 0n
  return updateAt(arr, current - value, index)
}
