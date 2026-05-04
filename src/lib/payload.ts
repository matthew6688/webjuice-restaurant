const PAYLOAD_URL = import.meta.env.PAYLOAD_URL || 'http://localhost:3000'

export async function fetchPages() {
  try {
    const res = await fetch(`${PAYLOAD_URL}/api/pages?where[published][equals]=true`)
    const data = await res.json()
    return data.docs || []
  } catch {
    return []
  }
}

export async function fetchPosts() {
  try {
    const res = await fetch(`${PAYLOAD_URL}/api/posts?where[published][equals]=true&sort=-publishedDate`)
    const data = await res.json()
    return data.docs || []
  } catch {
    return []
  }
}

export async function fetchPageBySlug(slug: string) {
  try {
    const res = await fetch(`${PAYLOAD_URL}/api/pages?where[slug][equals]=${slug}&where[published][equals]=true`)
    const data = await res.json()
    return data.docs?.[0] || null
  } catch {
    return null
  }
}

export async function fetchPostBySlug(slug: string) {
  try {
    const res = await fetch(`${PAYLOAD_URL}/api/posts?where[slug][equals]=${slug}&where[published][equals]=true`)
    const data = await res.json()
    return data.docs?.[0] || null
  } catch {
    return null
  }
}

export function extractTextFromLexical(content: any): string {
  if (!content?.root?.children) return ''
  let text = ''
  for (const node of content.root.children) {
    if (node.children) {
      for (const child of node.children) {
        if (child.text) text += child.text + ' '
      }
    }
  }
  return text.trim()
}
