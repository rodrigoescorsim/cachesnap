/** Stable probe region order for the public CDN checker (matches scheduler). */
export const PUBLIC_PROBE_REGION_IDS = [
  'af-south',
  'ap-east',
  'ap-south',
  'eu-west',
  'oc',
  'sa-east',
  'us-east',
  'us-west',
] as const

export type PublicProbeRegionId = (typeof PUBLIC_PROBE_REGION_IDS)[number]

export const PUBLIC_REGION_LABELS: Record<string, string> = {
  'sa-east': 'São Paulo',
  'eu-west': 'Frankfurt',
  'us-east': 'Ohio',
  'us-west': 'Oregon',
  'ap-east': 'Tokyo',
  'ap-south': 'Mumbai',
  oc: 'Sydney',
  'af-south': 'Cape Town',
}

export const PUBLIC_REGION_DESCRIPTIONS: Record<string, string> = {
  'sa-east': 'South America — AWS sa-east-1 (São Paulo, BR)',
  'eu-west': 'Europe — AWS eu-central-1 (Frankfurt, DE)',
  'us-east': 'US East — AWS us-east-2 (Ohio, US)',
  'us-west': 'US West — AWS us-west-2 (Oregon, US)',
  'ap-east': 'Asia Pacific — AWS ap-northeast-1 (Tokyo, JP)',
  'ap-south': 'India — AWS ap-south-1 (Mumbai, IN)',
  oc: 'Oceania — AWS ap-southeast-2 (Sydney, AU)',
  'af-south': 'Africa — AWS af-south-1 (Cape Town, ZA)',
}
