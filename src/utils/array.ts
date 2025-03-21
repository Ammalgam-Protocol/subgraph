// insert value into arr at index
export function insert<Type>(arr: Array<Type>, value: Type, index: i32 = -1): Array<Type> {
  if (arr.length == 0) {
    return [value]
  }
  if (index == -1 || index > arr.length) {
    index = arr.length
  }
  const result: Type[] = []
  for (let i = 0; i < index; i++) {
    result.push(arr[i])
  }
  result.push(value)
  for (let i = index; i < arr.length; i++) {
    result.push(arr[i])
  }
  return result
}

// update value in arr at index
export function update<Type>(arr: Array<Type>, value: Type, index: i32): Array<Type> {
  if (arr.length == 0) {
    return [value]
  }
  if (index < 0 || index >= arr.length) {
    return arr // Return original array if index is out of bounds
  }
  const result: Type[] = []
  for (let i = 0; i < arr.length; i++) {
    if (i === index) {
      result.push(value)
    } else {
      result.push(arr[i])
    }
  }
  return result
}
