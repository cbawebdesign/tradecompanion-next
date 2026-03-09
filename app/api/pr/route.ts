import { NextRequest, NextResponse } from 'next/server'

const SCANZZERS_API_KEY = process.env.SCANZZERS_API_KEY || ''

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  try {
    const response = await fetch(`https://stage.news.scanzzers.com/tc/ampspr?id=${id}`, {
      headers: { 'X-Api-Key': SCANZZERS_API_KEY },
    })
    const content = await response.text()
    const contentType = response.headers.get('content-type') || 'text/html'
    return new NextResponse(content, {
      status: response.status,
      headers: { 'Content-Type': contentType },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch PR content' }, { status: 502 })
  }
}
