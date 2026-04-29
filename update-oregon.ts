import sql from './src/lib/db'

async function updateOregonColor() {
  try {
    await sql`UPDATE regions SET color = '#f97316' WHERE id = 'us-west'`
    console.log('Successfully updated Oregon color to Coral (#f97316)')
  } catch (err) {
    console.error('Failed to update color:', err)
  }
  process.exit(0)
}

updateOregonColor()
