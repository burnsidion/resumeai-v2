const encoder = new TextEncoder()

const createPdfObject = (id: number, value: string): string =>
  `${id} 0 obj\n${value}\nendobj\n`

export const createSyntheticResumePdf = (): Uint8Array => {
  const contents = [
    'BT',
    '/F1 18 Tf',
    '72 720 Td',
    '(Jordan Example) Tj',
    '0 -28 Td',
    '(jordan@example.test) Tj',
    '0 -44 Td',
    '(Experience) Tj',
    '0 -28 Td',
    '(Built accessible Vue interfaces.) Tj',
    '0 -44 Td',
    '(Skills) Tj',
    '0 -28 Td',
    '(Vue and TypeScript) Tj',
    'ET',
  ].join('\n')
  const objects = [
    createPdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    createPdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    createPdfObject(
      3,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    ),
    createPdfObject(
      4,
      `<< /Length ${encoder.encode(contents).byteLength} >>\nstream\n${contents}\nendstream`,
    ),
    createPdfObject(
      5,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ),
  ]
  let document = '%PDF-1.4\n'
  const offsets = [0]

  for (const object of objects) {
    offsets.push(encoder.encode(document).byteLength)
    document += object
  }

  const xrefOffset = encoder.encode(document).byteLength
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  document += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\n`
  document += `startxref\n${xrefOffset}\n%%EOF\n`

  return encoder.encode(document)
}

export const syntheticResumeExtraction = {
  items: [
    {
      fontFamily: 'Helvetica',
      fontSize: 18,
      hasEOL: true,
      height: 18,
      page: 1,
      text: 'Jordan Example',
      width: 120,
      x: 72,
      y: 720,
    },
    {
      fontFamily: 'Helvetica',
      fontSize: 18,
      hasEOL: true,
      height: 18,
      page: 1,
      text: 'jordan@example.test',
      width: 160,
      x: 72,
      y: 692,
    },
    {
      fontFamily: 'Helvetica',
      fontSize: 18,
      hasEOL: true,
      height: 18,
      page: 1,
      text: 'Experience',
      width: 110,
      x: 72,
      y: 648,
    },
    {
      fontFamily: 'Helvetica',
      fontSize: 18,
      hasEOL: true,
      height: 18,
      page: 1,
      text: 'Built accessible Vue interfaces.',
      width: 210,
      x: 72,
      y: 620,
    },
    {
      fontFamily: 'Helvetica',
      fontSize: 18,
      hasEOL: true,
      height: 18,
      page: 1,
      text: 'Skills',
      width: 54,
      x: 72,
      y: 576,
    },
    {
      fontFamily: 'Helvetica',
      fontSize: 18,
      hasEOL: true,
      height: 18,
      page: 1,
      text: 'Vue and TypeScript',
      width: 150,
      x: 72,
      y: 548,
    },
  ],
  pageCount: 1,
} as const
