"use client";

export function decodeBase64ToBinary(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
  }

  return result;
}

export function encodeBinaryToBase64(value: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < value.length; index += 0x80_00) {
    binary += String.fromCharCode(...value.subarray(index, index + 0x80_00));
  }

  return btoa(binary);
}
