import os

path = r'c:\workspace\CacheSnap\src\app\dashboard\monitors\[id]\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Header area (lines 884-893 approx)
    if 'hasBypassComparison && (' in line and 'th' in lines[i+2]:
        new_lines.append(line.replace('{hasBypassComparison && (', '{/* always show bypass columns */}'))
        continue
    
    if i > 0 and '{/* always show bypass columns */}' in lines[i-1]:
        # skip next line which is <>
        continue
        
    if '           </th>' in line and i > 2 and 'Cache delta' in lines[i-1]:
        new_lines.append(line)
        # skip next 2 lines which are </> and )}
        skip = True
        skip_count = 2
        continue
    
    if skip:
        skip_count -= 1
        if skip_count == 0:
            skip = False
        continue

    # Cells area (around line 935)
    if '               {hasBypassComparison && (' in line and 'td' in lines[i+2]:
        new_lines.append(line.replace('{hasBypassComparison && (', '{/* always show bypass cells */}'))
        continue

    if i > 0 and '{/* always show bypass cells */}' in lines[i-1]:
        # skip next line which is <>
        continue

    if '                        </td>' in line and i > 2 and 'ms` : "-"' in lines[i-1] and 'cacheDelta != null' in lines[i-1]:
        new_lines.append(line)
        # skip next 2 lines which are </> and )}
        skip = True
        skip_count = 2
        continue

    new_lines.append(line)

# Let's try a simpler regex approach if the above is too brittle.
# But actually, I'll just use a direct string replacement on the ORIGINAL file content.

content = "".join(lines)

target1 = """                      {hasBypassComparison && (
                        <>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Average TTFB from native bypass requests (cache-bypass query param)">
                            TTFB bypass
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Cache delta = TTFB bypass - TTFB normal">
                            Cache delta
                          </th>
                        </>
                      )}"""

replacement1 = """                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Average TTFB from native bypass requests (cache-bypass query param)">
                        TTFB bypass
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500" title="Cache delta = TTFB bypass - TTFB normal">
                        Cache delta
                      </th>"""

target2 = """                          {hasBypassComparison && (
                            <>
                              <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${ttfbColor(normal?.bypass_ttfb_avg_ms ?? null)}`}>
                                {normal?.bypass_ttfb_avg_ms != null ? `${normal.bypass_ttfb_avg_ms}ms` : '-'}
                              </td>
                              <td
                                className={`px-4 py-3 text-right text-xs tabular-nums font-semibold ${cacheDeltaTone}`}
                                title={
                                  cacheDelta == null
                                    ? undefined
                                    : cacheDelta > 0
                                    ? 'Bypass is slower than normal; cache is likely helping.'
                                    : cacheDelta < 0
                                    ? 'Bypass is faster than normal; verify route parity and sample window.'
                                    : 'No measurable delta between normal and bypass.'
                                }
                              >
                                {cacheDelta != null ? `${cacheDelta > 0 ? '+' : ''}${cacheDelta}ms` : '-'}
                              </td>
                            </>
                          )}"""

replacement2 = """                          <td className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${ttfbColor(normal?.bypass_ttfb_avg_ms ?? null)}`}>
                            {normal?.bypass_ttfb_avg_ms != null ? `${normal.bypass_ttfb_avg_ms}ms` : '-'}
                          </td>
                          <td
                            className={`px-4 py-3 text-right text-xs tabular-nums font-semibold ${cacheDeltaTone}`}
                            title={
                              cacheDelta == null
                                ? undefined
                                : cacheDelta > 0
                                ? 'Bypass is slower than normal; cache is likely helping.'
                                : cacheDelta < 0
                                ? 'Bypass is faster than normal; verify route parity and sample window.'
                                : 'No measurable delta between normal and bypass.'
                            }
                          >
                            {cacheDelta != null ? `${cacheDelta > 0 ? '+' : ''}${cacheDelta}ms` : '-'}
                          </td>"""

content = content.replace(target1, replacement1)
content = content.replace(target2, replacement2)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
