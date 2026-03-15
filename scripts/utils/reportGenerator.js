'use strict';

/**
 * reportGenerator.js — Full markdown pipeline test report
 *
 * Every phase, every podcast, every raw value, every Gemini prompt + response.
 * No truncation anywhere.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function r2(n) {
  return n != null && !isNaN(n) ? (Math.round(n * 100) / 100).toFixed(2) : 'null';
}

function fmtDate(ts) {
  if (!ts) return 'unknown';
  return new Date(ts * 1000).toISOString().split('T')[0];
}

function daysSince(ts) {
  if (!ts) return '?';
  return Math.round((Date.now() / 1000 - ts) / 86400);
}

function fmtN(n) {
  return n != null ? Number(n).toLocaleString() : 'null';
}

const _GENERIC_05 = new Set([
  'contact','info','press','media','podcast','show','support','feedback',
  'admin','general','inquiries','inquiry','booking','bookings','noreply','no-reply',
]);
const _GENERIC_07 = new Set([
  'hello','hi','hey','team','crew','studio','listen','pod','thepod','mail','email','ask','reach',
]);

function emailType(email) {
  if (!email) return 'absent (ratio=0)';
  const local = email.split('@')[0].toLowerCase();
  if (_GENERIC_05.has(local)) return 'generic (ratio=0.5)';
  if (_GENERIC_07.has(local)) return 'semi-generic (ratio=0.7)';
  return 'personal (ratio=1.0)';
}

// ── DATA COMPLETENESS CARD ─────────────────────────────────────────────────────

function dataCompletenessCard(feed) {
  const L = [];
  const p = s => L.push(s);
  const ok  = (val, display)  => `✅ ${display != null ? display : val}`;
  const nok = (reason)         => `❌ ${reason}`;

  const yesNo = v => v ? '✅' : '❌';
  const fmtK  = n => n != null ? Number(n).toLocaleString() : null;
  const title = (feed.title || 'unknown').slice(0, 40);

  p(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  p(`DATA COMPLETENESS — ${title}`);
  p(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  p('');
  p('**SCORING DATA**');

  // 1. guest_ratio_last10
  p(`  guest_ratio_last10        ${feed.gemini_guest_ratio != null ? ok(feed.gemini_guest_ratio) : nok('not found')}`);
  // 2. guest_authority_ratio — computed, always present if guest_ratio present
  const gAuthSrc = (feed.gemini_recent_guests && feed.gemini_recent_guests.length > 0)
    ? `from ${feed.gemini_recent_guests.length} guests (role-based)`
    : `legacy fallback (${feed.gemini_guest_authority || 'none'})`;
  p(`  guest_authority_ratio     ${feed.gemini_guest_authority != null || (feed.gemini_recent_guests && feed.gemini_recent_guests.length > 0) ? ok(null, gAuthSrc) : nok('not found')}`);
  // 3. avg_episode_length
  p(`  avg_episode_length        ${feed.avg_episode_length_min != null ? ok(feed.avg_episode_length_min, `${feed.avg_episode_length_min} min`) : nok('not found')}`);
  // 4. apple_rating
  p(`  apple_rating              ${feed.apple_rating != null ? ok(feed.apple_rating, `${feed.apple_rating}/5`) : nok('not found')}`);
  // 5. apple_rating_count
  p(`  apple_rating_count        ${feed.apple_rating_count != null ? ok(fmtK(feed.apple_rating_count)) : nok('not found')}`);
  // 6. spotify_rating
  p(`  spotify_rating            ${feed.spotify_rating != null ? ok(feed.spotify_rating, `${feed.spotify_rating}/5`) : nok('not found')}`);
  // 7. spotify_review_count
  p(`  spotify_review_count      ${feed.spotify_review_count != null ? ok(fmtK(feed.spotify_review_count)) : nok('not found')}`);
  // 8. apple_chart_rank
  p(`  apple_chart_rank          ${feed.apple_chart_rank != null ? ok(feed.apple_chart_rank, `#${feed.apple_chart_rank}`) : nok('not charted')}`);
  // 9. spotify_chart_rank
  p(`  spotify_chart_rank        ${feed.spotify_chart_rank != null ? ok(feed.spotify_chart_rank, `#${feed.spotify_chart_rank}`) : nok('not charted')}`);
  // 10. yt_subscribers
  {
    const rejYt = feed._rejected_youtube_channel;
    const ytReason = rejYt ? `rejected (guest channel: ${rejYt})` : (feed.website_youtube ? 'API error / private' : 'no YouTube URL found');
    p(`  yt_subscribers            ${feed.yt_subscribers != null ? ok(fmtK(feed.yt_subscribers)) : nok(ytReason)}`);
  }
  // 11. yt_avg_views_per_video
  p(`  yt_avg_views_per_video    ${feed.yt_avg_views_per_video != null ? ok(fmtK(feed.yt_avg_views_per_video)) : nok('not found')}`);
  // 12. instagram_followers
  {
    const rejIg = feed._rejected_instagram;
    const igReason = rejIg ? `rejected (guest account: ${rejIg})` : (feed.website_instagram ? 'scraper failed / login wall' : 'no Instagram URL found');
    p(`  instagram_followers       ${feed.instagram_followers != null ? ok(fmtK(feed.instagram_followers)) : nok(igReason)}`);
  }
  // 13. podcast_age
  {
    const oldest = feed.oldestItemPubdate;
    const ageYears = oldest ? ((Date.now()/1000 - oldest) / (365.25*86400)).toFixed(1) : null;
    p(`  podcast_age               ${oldest ? ok(ageYears, `${ageYears} years`) : nok('no oldest episode date')}`);
  }
  // 14. activity_ratio (newestItemPubdate)
  {
    const newest = feed.newestItemPubdate || feed.lastUpdate;
    const dSince = newest ? Math.round((Date.now()/1000 - newest) / 86400) : null;
    p(`  activity_ratio            ${newest ? ok(null, `${dSince} days since last ep`) : nok('no publish date')}`);
  }
  // 15. publish_consistency
  p(`  publish_consistency       ${feed.publish_consistency != null ? ok(feed.publish_consistency, `${feed.publish_consistency}/100`) : nok('not computed')}`);
  // 16. episode_count
  p(`  episode_count             ${feed.episodeCount != null ? ok(fmtK(feed.episodeCount)) : nok('not found')}`);

  // Count scoring signals
  const scoringPresent = [
    feed.gemini_guest_ratio != null,
    feed.gemini_guest_authority != null || (feed.gemini_recent_guests && feed.gemini_recent_guests.length > 0),
    feed.avg_episode_length_min != null,
    feed.apple_rating != null,
    feed.apple_rating_count != null,
    feed.spotify_rating != null,
    feed.spotify_review_count != null,
    feed.apple_chart_rank != null,
    feed.spotify_chart_rank != null,
    feed.yt_subscribers != null,
    feed.yt_avg_views_per_video != null,
    feed.instagram_followers != null,
    feed.oldestItemPubdate != null,
    (feed.newestItemPubdate || feed.lastUpdate) != null,
    feed.publish_consistency != null,
    feed.episodeCount != null,
  ].filter(Boolean).length;

  p('');
  p('**WEBAPP DISPLAY DATA**');
  p(`  title                     ${feed.title ? '✅' : '❌'}`);
  p(`  description               ${feed.description ? '✅' : '❌'}`);
  p(`  imageUrl                  ${feed.imageUrl ? '✅' : '❌'}`);
  p(`  ai_summary                ${feed.ai_summary ? '✅' : '❌'}`);
  p(`  ai_primary_category       ${feed.ai_primary_category ? ok(feed.ai_primary_category) : '❌'}`);
  p(`  ai_secondary_categories   ${feed.ai_secondary_categories && feed.ai_secondary_categories.length ? ok(null, feed.ai_secondary_categories.join(', ')) : '❌'}`);
  p(`  ai_topics                 ${feed.ai_topics && feed.ai_topics.length ? ok(null, feed.ai_topics.slice(0,4).join(', ')) : '❌'}`);
  p(`  ai_target_audience        ${feed.ai_target_audience ? '✅' : '❌'}`);
  p(`  ai_audience_size          ${feed.ai_audience_size ? ok(feed.ai_audience_size) : '❌'}`);
  p(`  ai_engagement_level       ${feed.ai_engagement_level ? ok(feed.ai_engagement_level) : '❌'}`);
  p(`  itunesId                  ${feed.itunesId ? '✅' : '❌'}`);
  p(`  lastUpdate                ${feed.newestItemPubdate ? ok(null, fmtDate(feed.newestItemPubdate)) : '❌'}`);
  p(`  avg_episode_length        ${feed.avg_episode_length_min != null ? ok(feed.avg_episode_length_min, `${feed.avg_episode_length_min} min`) : '❌'}`);

  const webappPresent = [
    feed.title, feed.description, feed.imageUrl, feed.ai_summary,
    feed.ai_primary_category, feed.ai_secondary_categories?.length,
    feed.ai_topics?.length, feed.ai_target_audience, feed.ai_audience_size,
    feed.ai_engagement_level, feed.itunesId, feed.newestItemPubdate,
    feed.avg_episode_length_min != null,
  ].filter(Boolean).length;

  p('');
  p('**OUTREACH DATA**');
  const emailVal = feed.rss_owner_email || feed.website_email || null;
  p(`  rss_owner_email           ${feed.rss_owner_email ? ok(feed.rss_owner_email, `${feed.rss_owner_email} (${emailType(feed.rss_owner_email)})`) : nok('not found')}`);
  p(`  website_email             ${feed.website_email ? ok(feed.website_email) : nok('not found')}`);
  {
    const rejTw = feed._rejected_twitter;
    p(`  website_twitter           ${feed.website_twitter ? ok(feed.website_twitter) : (rejTw ? nok(`rejected (guest account: ${rejTw})`) : nok('not found'))}`);
  }
  p(`  website_linkedin          ${feed.website_linkedin ? ok(feed.website_linkedin) : nok('not found')}`);
  {
    const rejIg = feed._rejected_instagram;
    const igDisp = feed.website_instagram
      ? (feed.instagram_followers != null ? `${feed.website_instagram} (${fmtK(feed.instagram_followers)} followers)` : feed.website_instagram)
      : null;
    p(`  website_instagram         ${igDisp ? ok(igDisp) : (rejIg ? nok(`rejected (guest account: ${rejIg})`) : nok('not found'))}`);
  }
  {
    const rejYt = feed._rejected_youtube_channel;
    const ytDisp = feed.website_youtube
      ? (feed.yt_subscribers != null ? `${feed.website_youtube} (${fmtK(feed.yt_subscribers)} subs)` : feed.website_youtube)
      : null;
    p(`  website_youtube           ${ytDisp ? ok(ytDisp) : (rejYt ? nok(`rejected (guest channel: ${rejYt})`) : nok('not found'))}`);
  }
  p(`  website_spotify           ${feed.website_spotify ? ok(feed.website_spotify) : nok('not found')}`);
  p(`  website_facebook          ${feed.website_facebook ? ok(feed.website_facebook) : nok('not found')}`);
  p(`  website_tiktok            ${feed.website_tiktok ? ok(feed.website_tiktok) : nok('not found')}`);

  const outreachPresent = [
    feed.rss_owner_email, feed.website_email, feed.website_twitter,
    feed.website_linkedin, feed.website_instagram, feed.website_youtube,
    feed.website_spotify, feed.website_facebook, feed.website_tiktok,
  ].filter(Boolean).length;

  p('');
  p('**GUEST INTELLIGENCE**');
  p(`  recent_guests             ${feed.gemini_recent_guests && feed.gemini_recent_guests.length ? ok(null, `${feed.gemini_recent_guests.length} guests identified across 10 episodes`) : '❌ none identified'}`);
  p(`  guest_types               ${feed.gemini_guest_types && feed.gemini_guest_types.length ? ok(null, feed.gemini_guest_types.join(', ')) : '❌'}`);
  p(`  guest_industries          ${feed.gemini_guest_industries && feed.gemini_guest_industries.length ? ok(null, feed.gemini_guest_industries.join(', ')) : '❌'}`);
  p(`  typical_guest_profile     ${feed.gemini_typical_guest_profile ? ok(null, `"${feed.gemini_typical_guest_profile}"`) : '❌'}`);

  p('');
  p('**SCORE SUMMARY**');
  p(`  ai_badassery_score        ${feed.ai_badassery_score != null ? feed.ai_badassery_score + '/100' : '—'}`);
  p(`  score_guest_compatibility ${feed.score_guest_compatibility != null ? feed.score_guest_compatibility.toFixed(1) + '/100' : '—'}`);
  p(`  score_audience_power      ${feed.score_audience_power != null ? feed.score_audience_power.toFixed(1) + '/100' : '—'}`);
  p(`  score_podcast_authority   ${feed.score_podcast_authority != null ? feed.score_podcast_authority.toFixed(1) + '/100' : '—'}`);
  p(`  score_activity_consistency ${feed.score_activity_consistency != null ? feed.score_activity_consistency.toFixed(1) + '/100' : '—'}`);
  p(`  score_engagement          ${feed.score_engagement != null ? feed.score_engagement.toFixed(1) + '/100' : '—'}`);
  p(`  score_contactability      ${feed.score_contactability != null ? feed.score_contactability.toFixed(1) + '/100' : '—'}`);
  p(`  ai_global_percentile      ${feed.ai_global_percentile != null ? feed.ai_global_percentile + 'th' : '—'}`);
  p(`  ai_category_percentile    ${feed.ai_category_percentile != null ? feed.ai_category_percentile + 'th (in ' + (feed.ai_primary_category||'?') + ')' : '—'}`);
  p(`  score_missing_signals     [${(feed.score_missing_signals||[]).join(', ')||'none'}]`);
  p(`  score_version             ${feed.score_version || '—'}`);

  p('');
  p('**DATA COMPLETENESS SCORE**');
  const total = 16 + 13 + 9;
  const totalPresent = scoringPresent + webappPresent + outreachPresent;
  p(`  Scoring signals:   ${scoringPresent}/16 present (${Math.round(scoringPresent/16*100)}% complete)`);
  p(`  Webapp fields:     ${webappPresent}/13 present (${Math.round(webappPresent/13*100)}% complete)`);
  p(`  Outreach fields:   ${outreachPresent}/9 present (${Math.round(outreachPresent/9*100)}% complete)`);
  p(`  ─────────────────────────────────────`);
  p(`  OVERALL:           ${totalPresent}/${total} fields (${Math.round(totalPresent/total*100)}% complete)`);
  p('');

  return L;
}

/**
 * Compute effective weights after null redistribution.
 * Returns array of { name, value, rawWeight, effectiveWeight, isNull }
 */
function computeEffectiveWeights(signals) {
  const valid = signals.filter(s => s.value !== null && s.value !== undefined && !isNaN(s.value));
  const totalValidW = valid.reduce((acc, s) => acc + s.weight, 0);
  return signals.map(s => {
    const isNull = s.value === null || s.value === undefined || isNaN(s.value);
    return {
      ...s,
      isNull,
      effectiveWeight: isNull ? null : s.weight / totalValidW,
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

function generateReport(feeds, runConfig, runStats) {
  const L = [];
  const push  = s => L.push(s ?? '');
  const hr    = () => push('---');
  const blank = () => push('');

  const enriched = feeds.filter(f => !f._drop);
  const scored   = enriched.filter(f => f.ai_badassery_score != null);
  const dur = Math.round((Date.now() - (runStats.startTime || Date.now())) / 1000);

  // ═══════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════
  push('# Brooklyn Intelligence — Pipeline Test Report');
  blank();
  push(`Generated: ${new Date().toISOString()}`);
  const flags = [
    '--limit=' + (runConfig.LIMIT === Infinity ? 'all' : runConfig.LIMIT),
    ...(runConfig.VERBOSE       ? ['--verbose']       : []),
    ...(runConfig.REPORT        ? ['--report']         : []),
    ...(runConfig.NO_DEDUP      ? ['--no-dedup']       : []),
    ...(runConfig.NO_CHECKPOINT ? ['--no-checkpoint']  : []),
    ...(runConfig.SKIP_PHASE1   ? ['--skip-phase1']    : []),
    ...(runConfig.SKIP_CHARTS   ? ['--skip-charts']    : []),
  ].join(' ');
  push(`Run config: ${flags}`);
  push('Pipeline version: 1.0');
  push(`Duration: ${dur}s`);
  blank();

  // ═══════════════════════════════════════════════════════════
  // PHASE 1
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 1 — SQLite Filter');
  blank();

  if (runConfig.SKIP_PHASE1) {
    push('> **Skipped** — feeds loaded from existing checkpoints');
    blank();
  } else {
    push(`Total SQLite records scanned: **${(runStats.p1?.totalCandidates || 0).toLocaleString()}**`);
    blank();
    push('Filters applied:');
    push('  `language LIKE "en%"` | `episodeCount >= 50` | `newestItemPubdate > now - 60d`');
    push('  `itunesId IS NOT NULL` | `dead = 0` | `lastHttpStatus = 200`');
    push('  Ordered by `popularityScore DESC`');
    blank();
  }

  push(`**${feeds.length} podcasts selected:**`);
  blank();

  feeds.forEach((f, i) => {
    push(`### Podcast ${i+1}: ${f.title}`);
    push(`  feedId:          ${f.feedId || '—'}`);
    push(`  itunesId:        ${f.itunesId || '—'}`);
    push(`  author:          ${f.author || f.ownerName || '—'}`);
    push(`  language:        ${f.language || '—'}`);
    push(`  episodeCount:    ${f.episodeCount || '—'}`);
    push(`  lastUpdate:      ${fmtDate(f.newestItemPubdate)} (${daysSince(f.newestItemPubdate)} days ago)`);
    push(`  oldestEpisode:   ${fmtDate(f.oldestItemPubdate)}`);
    push(`  popularityScore: ${f.popularityScore ?? '—'}`);
    push(`  category1:       ${f.category1 || '—'}`);
    push(`  category2:       ${f.category2 || '—'}`);
    push(`  category3:       ${f.category3 || '—'}`);
    push(`  link:            ${f.homepageUrl || '—'}`);
    push(`  imageUrl:        ${f.imageUrl || '—'}`);
    push(`  description:`);
    push(`    "${f.description || '(none)'}"`);
    blank();
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 2
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 2 — Charts Cache');
  blank();

  if (runConfig.SKIP_CHARTS) {
    push('> **Skipped** — `--skip-charts` flag');
  } else {
    push(`Apple Charts:  **${(runStats.p2?.appleCount || 0).toLocaleString()}** podcasts indexed`);
    push(`Spotify Charts: **${(runStats.p2?.spotifyCount || 0).toLocaleString()}** podcasts indexed`);
    push(`Chart hits for this batch: **${runStats.p2?.chartHits || 0}/${feeds.length}** podcasts matched`);
  }
  blank();
  push('No per-podcast action at this stage — cache ready for Phase 4 lookup.');
  blank();

  // ═══════════════════════════════════════════════════════════
  // PHASE 3
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 3 — PodcastIndex API (Episodes)');
  blank();

  push('| # | title | episodes | avg_dur_min | consistency | has_chapters | has_transcripts |');
  push('|---|-------|----------|-------------|-------------|--------------|-----------------|');
  feeds.forEach((f, i) => {
    push(`| ${i+1} | ${(f.title||'').slice(0,35)} | ${(f.episodes||[]).length} | ${f.avg_episode_length_min??'—'} | ${f.publish_consistency??'—'} | ${f.has_chapters?'✓':'✗'} | ${f.has_transcripts?'✓':'✗'} |`);
  });
  blank();

  for (const [i, feed] of feeds.entries()) {
    const eps = feed.episodes || [];
    if (eps.length === 0) continue;

    push(`### Podcast ${i+1}: ${feed.title}`);
    blank();
    push(`  avg_episode_length: **${feed.avg_episode_length_min ?? '?'} min**`);
    if (feed._publish_intervals_days?.length > 0) {
      push(`  publish_intervals: [${feed._publish_intervals_days.join(', ')}] days`);
    }
    push(`  publish_consistency: **${feed.publish_consistency ?? '—'}/100**`);
    blank();

    eps.forEach((ep, j) => {
      const durMin = ep.duration ? `${Math.round(ep.duration / 60)}min (${ep.duration}s)` : '? (no duration)';
      const date   = ep.datePublished ? fmtDate(ep.datePublished) : '?';
      push(`  **Episode ${j+1}:**`);
      push(`    Title:       "${ep.title}"`);
      push(`    Description: "${ep.description || '(none)'}"`);
      push(`    Duration:    ${durMin}`);
      push(`    Date:        ${date}`);
      blank();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 3b
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 3b — Gemini Guest-Friendly Filter');
  blank();
  push(`Input: **${feeds.length}** podcasts | Model: \`gemini-2.5-flash-lite\``);
  blank();

  // Summary table
  push('| # | title | guest_friendly | guest_ratio | guest_authority | confidence | latency | result |');
  push('|---|-------|----------------|-------------|-----------------|------------|---------|--------|');
  feeds.forEach((f, i) => {
    const result  = f._drop ? `❌ \`${f._drop}\`` : '✅ pass';
    const latency = f._p3b_latency_ms != null ? `${f._p3b_latency_ms}ms` : '—';
    push(`| ${i+1} | ${(f.title||'').slice(0,30)} | ${f.gemini_guest_friendly??'—'} | ${f.gemini_guest_ratio??'—'} | ${f.gemini_guest_authority??'—'} | ${f.gemini_guest_confidence??'—'} | ${latency} | ${result} |`);
  });
  blank();

  // Per-podcast: full prompt + raw response
  for (const [i, feed] of feeds.entries()) {
    if (feed._p3b_prompt == null && feed.gemini_guest_friendly == null) continue;

    push(`### Podcast ${i+1}: ${feed.title}`);
    blank();
    push('**Prompt sent:**');
    blank();
    push('```');
    push(feed._p3b_prompt || '(prompt not captured — feed had no episodes)');
    push('```');
    blank();
    push('**Raw Gemini response:**');
    blank();
    push('```json');
    push(feed._p3b_raw_response || '(no response captured)');
    push('```');
    blank();
    push('**Parsed:**');
    push(`  guest_friendly:     ${feed.gemini_guest_friendly}`);
    push(`  guest_ratio_last10: ${feed.gemini_guest_ratio ?? '—'}`);
    push(`  guest_authority:    ${feed.gemini_guest_authority ?? '—'}`);
    push(`  confidence:         ${feed.gemini_guest_confidence ?? '—'}`);
    if (feed.gemini_guest_types && feed.gemini_guest_types.length > 0) {
      push(`  guest_types:        ${feed.gemini_guest_types.join(', ')}`);
    }
    if (feed.gemini_guest_industries && feed.gemini_guest_industries.length > 0) {
      push(`  guest_industries:   ${feed.gemini_guest_industries.join(', ')}`);
    }
    if (feed.gemini_typical_guest_profile) {
      push(`  typical_guest:      ${feed.gemini_typical_guest_profile}`);
    }
    if (feed.gemini_recent_guests && feed.gemini_recent_guests.length > 0) {
      push(`  recent_guests (${feed.gemini_recent_guests.length}):`);
      feed.gemini_recent_guests.forEach(g => {
        push(`    Ep${g.episode_index}: ${g.guest_name || 'unnamed'} — ${g.guest_role} (${g.guest_industry})`);
      });
    }
    push(`  Latency: ${feed._p3b_latency_ms != null ? feed._p3b_latency_ms + 'ms' : '—'}`);
    push(`  Result:  ${feed._drop ? '❌ DROP (' + feed._drop + ')' : '✅ PASS → continues to Phase 4'}`);
    blank();
    hr();
    blank();
  }

  const p3bPassed  = feeds.filter(f => f.gemini_guest_friendly === true).length;
  const p3bDropped = feeds.filter(f => f._drop === 'not_guest_friendly' || f._drop === 'guest_ratio_below_threshold');
  push(`**Filter summary: ${p3bPassed}/${feeds.length} passed**`);
  if (p3bDropped.length > 0) {
    push(`**Dropped ${p3bDropped.length} podcasts:**`);
    p3bDropped.forEach(f => push(`  - ${f.title} → \`${f._drop}\``));
  }
  blank();

  // ═══════════════════════════════════════════════════════════
  // PHASE 4
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 4 — Enrichissement Data');
  blank();

  if (enriched.length === 0) {
    push('> No podcasts passed Phase 3b guest filter — Phase 4 not executed.');
    blank();
  }

  for (const [i, feed] of enriched.entries()) {
    push(`### Podcast ${i+1}: ${feed.title}`);
    blank();

    push('**[Apple Podcasts]**');
    push(`  apple_rating:        ${feed.apple_rating ?? 'null'}`);
    push(`  apple_rating_count:  ${fmtN(feed.apple_rating_count)}`);
    push(`  apple_chart_rank:    ${feed.apple_chart_rank ? `#${feed.apple_chart_rank} in ${feed.apple_chart_genre}` : 'not charted'}`);
    push(`  scrape_status:       ${feed.apple_rating != null ? '✓ success' : '— no data'}`);
    blank();

    push('**[Spotify]**');
    push(`  spotify_rating:       ${feed.spotify_rating ?? 'null'}`);
    push(`  spotify_review_count: ${fmtN(feed.spotify_review_count)}`);
    push(`  spotify_chart_rank:   ${feed.spotify_chart_rank ? `#${feed.spotify_chart_rank} in ${feed.spotify_chart_genre}` : 'not charted'}`);
    push(`  spotify_url:          ${feed.website_spotify || 'not found'}`);
    push(`  scrape_status:        ${!feed.website_spotify ? '— no URL' : (feed.spotify_rating != null ? '✓ success' : '— no rating found')}`);
    blank();

    push('**[YouTube]**');
    push(`  yt_subscribers:          ${fmtN(feed.yt_subscribers)}`);
    push(`  yt_total_views:          ${fmtN(feed.yt_total_views)}`);
    push(`  yt_avg_views_per_video:  ${fmtN(feed.yt_avg_views_per_video)}`);
    push(`  source_url:              ${feed.website_youtube || 'not found in RSS/homepage'}`);
    push(`  api_status:              ${!feed.website_youtube ? '— no URL' : (feed.yt_subscribers != null ? '✓ success' : '— api error or no data')}`);
    blank();

    push('**[Instagram]**');
    push(`  instagram_followers: ${fmtN(feed.instagram_followers)}`);
    push(`  source_url:          ${feed.website_instagram || 'not found'}`);
    push(`  scrape_status:       ${!feed.website_instagram ? '— no URL found' : (feed.instagram_followers != null ? '✓ success' : '— login_wall or blocked')}`);
    blank();

    push('**[RSS / Homepage]**');
    push(`  rss_owner_email:   ${feed.rss_owner_email || 'null'}`);
    push(`  website_email:     ${feed.website_email || 'null'}`);
    push(`  website_twitter:   ${feed.website_twitter || 'null'}`);
    push(`  website_linkedin:  ${feed.website_linkedin || 'null'}`);
    push(`  website_instagram: ${feed.website_instagram || 'null'}`);
    push(`  website_youtube:   ${feed.website_youtube || 'null'}`);
    push(`  website_spotify:   ${feed.website_spotify || 'null'}`);
    push(`  website_facebook:  ${feed.website_facebook || 'null'}`);
    push(`  website_tiktok:    ${feed.website_tiktok || 'null'}`);
    blank();
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 5
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 5 — Gemini Full Scoring');
  blank();

  if (enriched.length === 0) {
    push('> No podcasts enriched — Phase 5 not executed.');
    blank();
  }

  for (const [i, feed] of enriched.entries()) {
    if (feed.aiCategorizationStatus == null) continue;

    push(`### Podcast ${i+1}: ${feed.title}`);
    blank();
    push(`Gemini latency: **${feed._p5_latency_ms != null ? `${feed._p5_latency_ms}ms` : '—'}**`);
    blank();

    push('**Prompt sent:**');
    blank();
    push('```');
    push(feed._p5_prompt || '(prompt not captured)');
    push('```');
    blank();

    push('**Raw Gemini response:**');
    blank();
    push('```json');
    push(feed._p5_raw_response || '(no response captured)');
    push('```');
    blank();

    if (feed.aiCategorizationStatus === 'failed') {
      push(`❌ **FAILED**: \`${feed.aiCategorizationError || 'unknown error'}\``);
    } else {
      push('**Parsed output:**');
      push(`  primary_category:       **${feed.ai_primary_category ?? '—'}**`);
      push(`  secondary_categories:   [${(feed.ai_secondary_categories || []).join(', ')}]`);
      push(`  topics:                 [${(feed.ai_topics || []).join(', ')}]`);
      push(`  target_audience:        "${feed.ai_target_audience ?? ''}"`);
      push(`  podcast_style:          ${feed.ai_podcast_style ?? '—'}`);
      push(`  business_relevance:     **${feed.ai_business_relevance ?? '—'}/10**`);
      push(`  content_quality:        **${feed.ai_content_quality ?? '—'}/10**`);
      push(`  audience_size_estimate: **${feed.ai_audience_size ?? '—'}**`);
      push(`  engagement_level:       **${feed.ai_engagement_level ?? '—'}**`);
      push(`  monetization_potential: ${feed.ai_monetization_potential ?? '—'}/10`);
      push(`  summary:                "${feed.ai_summary ?? ''}"`);
    }
    blank();
    hr();
    blank();
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 6
  // ═══════════════════════════════════════════════════════════
  hr();
  blank();
  push('## PHASE 6 — Badassery Score');
  blank();

  if (scored.length === 0) {
    push('> No podcasts reached Phase 6 scoring.');
    blank();
  }

  for (const [i, feed] of scored.entries()) {
    const d = feed._score_debug;
    if (!d) continue;
    const n = d.norms;

    push(`### Podcast ${i+1}: ${feed.title}`);
    blank();

    // ── GUEST COMPATIBILITY ──────────────────────────────────
    push('**GUEST COMPATIBILITY (weight: 20%)**');
    blank();
    {
      const sigs = [
        { name: 'guest_ratio_last10',        value: d.guest.ratios.gR, weight: 0.40 },
        { name: 'avg_episode_length_ratio',  value: d.guest.ratios.eL, weight: 0.30 },
        { name: 'guest_authority_ratio',     value: d.guest.ratios.gA, weight: 0.30 },
      ];
      const ew = computeEffectiveWeights(sigs);
      const nullSigs = ew.filter(s => s.isNull);
      const validSigs = ew.filter(s => !s.isNull);
      const totalValidW = validSigs.reduce((acc, s) => acc + s.weight, 0);

      push(`  guest_ratio_last10:`);
      push(`    raw:            ${d.guest.inputs.gemini_guest_ratio ?? 'null'} (from Gemini Phase 3b)`);
      push(`    ratio:          ${r2(d.guest.ratios.gR)}`);
      push(`    original weight: 0.40${d.guest.ratios.gR === null ? '  → NULL: weight donated to present signals' : `  → effective: ${r2(ew[0].effectiveWeight)}`}`);
      blank();
      push(`  avg_episode_length_ratio:`);
      push(`    raw:            ${d.guest.inputs.avg_episode_length_min ?? 'null'} min`);
      push(`    formula:        30-90min→1.0 | <30min→min/30 | >90min→max(0, 1-(min-90)/90)`);
      push(`    ratio:          ${r2(d.guest.ratios.eL)}`);
      push(`    original weight: 0.30${d.guest.ratios.eL === null ? '  → NULL: weight donated to present signals' : `  → effective: ${r2(ew[1].effectiveWeight)}`}`);
      blank();
      push(`  guest_authority_ratio:`);
      push(`    raw:            "${d.guest.inputs.gemini_guest_authority ?? 'null'}" (from Gemini Phase 3b)`);
      push(`    mapping:        none=0 | low=0.25 | medium=0.5 | high=0.75 | very_high=1.0`);
      push(`    ratio:          ${r2(d.guest.ratios.gA)}`);
      push(`    original weight: 0.30${d.guest.ratios.gA === null ? '  → NULL: weight donated to present signals' : `  → effective: ${r2(ew[2].effectiveWeight)}`}`);
      blank();

      if (nullSigs.length > 0) {
        push(`  NULL redistribution:`);
        push(`    Null signals: [${nullSigs.map(s => s.name).join(', ')}] (total weight ${nullSigs.reduce((a,s)=>a+s.weight,0).toFixed(2)} donated)`);
        push(`    Valid signals: [${validSigs.map(s => s.name).join(', ')}] receive redistributed weight`);
        push(`    Total valid weight used as denominator: ${totalValidW.toFixed(2)}`);
        blank();
      }

      const gMiss = (feed.score_missing_signals||[]).filter(s=>['gemini_guest_ratio','avg_episode_length_min','gemini_guest_authority'].includes(s));
      push(`  missing signals: [${gMiss.join(', ')||'none'}]`);
      const gFormula = validSigs.map(s => `${r2(s.value)}×${r2(s.effectiveWeight)}`).join(' + ');
      push(`  sub-score formula: ${gFormula || 'all null → 0.5 neutral'} = **${d.guest.score.toFixed(2)}/100**`);
    }
    blank();

    // ── AUDIENCE POWER ──────────────────────────────────────
    push('**AUDIENCE POWER (weight: 25%)**');
    blank();
    {
      const totalRev = (d.audience.inputs.apple_rating_count||0) + (d.audience.inputs.spotify_review_count||0);
      const sigs = [
        { name: 'ratings_ratio',          value: d.audience.ratios.rv, weight: 0.35 },
        { name: 'youtube_views_ratio',    value: d.audience.ratios.yt, weight: 0.25 },
        { name: 'social_followers_ratio', value: d.audience.ratios.sf, weight: 0.20 },
        { name: 'chart_rank_ratio',       value: d.audience.ratios.cr, weight: 0.20 },
      ];
      const ew = computeEffectiveWeights(sigs);
      const nullSigs = ew.filter(s => s.isNull);
      const validSigs = ew.filter(s => !s.isNull);
      const totalValidW = validSigs.reduce((acc, s) => acc + s.weight, 0);

      push(`  ratings_ratio:`);
      push(`    raw:    apple=${d.audience.inputs.apple_rating_count??0} + spotify=${d.audience.inputs.spotify_review_count??0} = ${totalRev} total reviews`);
      push(`    formula: log10(${totalRev}+1) / log10(${n?.maxReviews??'?'}+1)`);
      push(`    ratio:  ${r2(d.audience.ratios.rv)}`);
      push(`    original weight: 0.35${d.audience.ratios.rv===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[0].effectiveWeight)}`}`);
      blank();

      push(`  youtube_views_ratio:`);
      push(`    raw:    ${d.audience.inputs.yt_avg_views_per_video!=null ? fmtN(d.audience.inputs.yt_avg_views_per_video)+' avg views/video' : 'NULL'}`);
      push(`    formula: log10(views+1) / log10(${n?.maxViews!=null ? fmtN(n.maxViews) : '?'}+1)`);
      push(`    ratio:  ${r2(d.audience.ratios.yt)}`);
      push(`    original weight: 0.25${d.audience.ratios.yt===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[1].effectiveWeight)}`}`);
      blank();

      push(`  social_followers_ratio:`);
      push(`    raw:    instagram=${d.audience.inputs.instagram_followers!=null ? fmtN(d.audience.inputs.instagram_followers) : 'NULL'}`);
      push(`    formula: log10(followers+1) / log10(${n?.maxFollowers!=null ? fmtN(n.maxFollowers) : '?'}+1)`);
      push(`    ratio:  ${r2(d.audience.ratios.sf)}`);
      push(`    original weight: 0.20${d.audience.ratios.sf===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[2].effectiveWeight)}`}`);
      blank();

      const rankRaw = d.audience.inputs.apple_chart_rank && d.audience.inputs.spotify_chart_rank
        ? `min(apple #${d.audience.inputs.apple_chart_rank}, spotify #${d.audience.inputs.spotify_chart_rank}) = #${Math.min(d.audience.inputs.apple_chart_rank, d.audience.inputs.spotify_chart_rank)}`
        : (d.audience.inputs.apple_chart_rank ? `apple #${d.audience.inputs.apple_chart_rank}` : (d.audience.inputs.spotify_chart_rank ? `spotify #${d.audience.inputs.spotify_chart_rank}` : 'NULL'));
      push(`  chart_rank_ratio:`);
      push(`    raw:    ${rankRaw}`);
      push(`    formula: 1 - rank/200`);
      push(`    ratio:  ${r2(d.audience.ratios.cr)}`);
      push(`    original weight: 0.20${d.audience.ratios.cr===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[3].effectiveWeight)}`}`);
      blank();

      if (nullSigs.length > 0) {
        push(`  NULL redistribution:`);
        push(`    Null signals: [${nullSigs.map(s=>s.name).join(', ')}] (total weight ${nullSigs.reduce((a,s)=>a+s.weight,0).toFixed(2)} donated)`);
        push(`    Valid signals: [${validSigs.map(s=>s.name).join(', ')}] receive redistributed weight`);
        push(`    Total valid weight used as denominator: ${totalValidW.toFixed(2)}`);
        blank();
      }

      const aMiss = (feed.score_missing_signals||[]).filter(s=>['review_counts','yt_avg_views_per_video','instagram_followers','chart_rank'].includes(s));
      push(`  missing signals: [${aMiss.join(', ')||'none'}]`);
      const aFormula = validSigs.map(s=>`${r2(s.value)}×${r2(s.effectiveWeight)}`).join(' + ');
      push(`  sub-score formula: ${aFormula||'all null → 0.5 neutral'} = **${d.audience.score.toFixed(2)}/100**`);
    }
    blank();

    // ── PODCAST AUTHORITY ────────────────────────────────────
    push('**PODCAST AUTHORITY (weight: 15%)**');
    blank();
    {
      const sigs = [
        { name: 'podcast_age_ratio',       value: d.authority.ratios.pa, weight: 0.35 },
        { name: 'content_quality_ratio',   value: d.authority.ratios.cq, weight: 0.35 },
        { name: 'business_relevance_ratio',value: d.authority.ratios.br, weight: 0.30 },
      ];
      const ew = computeEffectiveWeights(sigs);
      const nullSigs = ew.filter(s=>s.isNull);
      const validSigs = ew.filter(s=>!s.isNull);
      const totalValidW = validSigs.reduce((acc,s)=>acc+s.weight,0);

      const yearsActive = d.authority.inputs.oldestItemPubdate
        ? ((Date.now()/1000 - d.authority.inputs.oldestItemPubdate) / (365.25*24*3600)).toFixed(2)
        : null;

      push(`  podcast_age_ratio:`);
      push(`    raw:    oldest episode: ${fmtDate(d.authority.inputs.oldestItemPubdate)} → ${yearsActive??'null'} years active`);
      push(`    formula: min(${yearsActive??'null'}/5, 1.0)`);
      push(`    ratio:  ${r2(d.authority.ratios.pa)}`);
      push(`    original weight: 0.35${d.authority.ratios.pa===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[0].effectiveWeight)}`}`);
      blank();

      push(`  content_quality_ratio:`);
      push(`    raw:    ${d.authority.inputs.ai_content_quality??'null'}/10 (from Gemini Phase 5)`);
      push(`    formula: (${d.authority.inputs.ai_content_quality??'X'}-1)/9`);
      push(`    ratio:  ${r2(d.authority.ratios.cq)}`);
      push(`    original weight: 0.35${d.authority.ratios.cq===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[1].effectiveWeight)}`}`);
      blank();

      push(`  business_relevance_ratio:`);
      push(`    raw:    ${d.authority.inputs.ai_business_relevance??'null'}/10 (from Gemini Phase 5)`);
      push(`    formula: (${d.authority.inputs.ai_business_relevance??'X'}-1)/9`);
      push(`    ratio:  ${r2(d.authority.ratios.br)}`);
      push(`    original weight: 0.30${d.authority.ratios.br===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[2].effectiveWeight)}`}`);
      blank();

      if (nullSigs.length > 0) {
        push(`  NULL redistribution:`);
        push(`    Null signals: [${nullSigs.map(s=>s.name).join(', ')}] (total weight ${nullSigs.reduce((a,s)=>a+s.weight,0).toFixed(2)} donated)`);
        push(`    Valid signals: [${validSigs.map(s=>s.name).join(', ')}] receive redistributed weight`);
        push(`    Total valid weight used as denominator: ${totalValidW.toFixed(2)}`);
        blank();
      }

      const authMiss = (feed.score_missing_signals||[]).filter(s=>['oldestItemPubdate','ai_content_quality','ai_business_relevance'].includes(s));
      push(`  missing signals: [${authMiss.join(', ')||'none'}]`);
      const authFormula = validSigs.map(s=>`${r2(s.value)}×${r2(s.effectiveWeight)}`).join(' + ');
      push(`  sub-score formula: ${authFormula||'all null → 0.5 neutral'} = **${d.authority.score.toFixed(2)}/100**`);
    }
    blank();

    // ── ACTIVITY & CONSISTENCY ───────────────────────────────
    push('**ACTIVITY & CONSISTENCY (weight: 20%)**');
    blank();
    {
      const sigs = [
        { name: 'activity_ratio',            value: d.activity.ratios.ac, weight: 0.60 },
        { name: 'publish_consistency_ratio', value: d.activity.ratios.pc, weight: 0.40 },
      ];
      const ew = computeEffectiveWeights(sigs);
      const nullSigs = ew.filter(s=>s.isNull);
      const validSigs = ew.filter(s=>!s.isNull);
      const totalValidW = validSigs.reduce((acc,s)=>acc+s.weight,0);

      const lastTs = d.activity.inputs.newestItemPubdate || d.activity.inputs.lastUpdate;
      const dSince = lastTs ? Math.round((Date.now()/1000 - lastTs)/86400) : null;

      push(`  activity_ratio:`);
      push(`    raw:    last update: ${fmtDate(lastTs)} → ${dSince??'NULL'} days ago`);
      push(`    formula: max(0, 1 - ${dSince??'X'}/60)`);
      push(`    ratio:  ${r2(d.activity.ratios.ac)}`);
      push(`    original weight: 0.60${d.activity.ratios.ac===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[0].effectiveWeight)}`}`);
      blank();

      const intervals = feed._publish_intervals_days?.slice(0, 9) || [];
      push(`  publish_consistency_ratio:`);
      push(`    raw intervals: [${intervals.join(', ')}] days`);
      push(`    raw value:     ${d.activity.inputs.publish_consistency??'null'}/100`);
      push(`    formula:       publish_consistency / 100`);
      push(`    ratio:  ${r2(d.activity.ratios.pc)}`);
      push(`    original weight: 0.40${d.activity.ratios.pc===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[1].effectiveWeight)}`}`);
      blank();

      if (nullSigs.length > 0) {
        push(`  NULL redistribution:`);
        push(`    Null signals: [${nullSigs.map(s=>s.name).join(', ')}] donated weight`);
        push(`    Total valid weight used as denominator: ${totalValidW.toFixed(2)}`);
        blank();
      }

      const actMiss = (feed.score_missing_signals||[]).filter(s=>['lastUpdate/newestItemPubdate','publish_consistency'].includes(s));
      push(`  missing signals: [${actMiss.join(', ')||'none'}]`);
      const actFormula = validSigs.map(s=>`${r2(s.value)}×${r2(s.effectiveWeight)}`).join(' + ');
      push(`  sub-score formula: ${actFormula||'all null → 0.5 neutral'} = **${d.activity.score.toFixed(2)}/100**`);
    }
    blank();

    // ── ENGAGEMENT ───────────────────────────────────────────
    push('**ENGAGEMENT (weight: 10%)**');
    blank();
    {
      const sigs = [
        { name: 'reviews_per_episode_ratio', value: d.engagement.ratios.rp, weight: 0.40 },
        { name: 'rating_ratio',              value: d.engagement.ratios.ra, weight: 0.60 },
      ];
      const ew = computeEffectiveWeights(sigs);
      const nullSigs = ew.filter(s=>s.isNull);
      const validSigs = ew.filter(s=>!s.isNull);
      const totalValidW = validSigs.reduce((acc,s)=>acc+s.weight,0);

      const totRevEng = (d.engagement.inputs.apple_rating_count||0) + (d.engagement.inputs.spotify_review_count||0);
      const eps = Math.max(d.engagement.inputs.episodeCount||1, 1);
      const revPerEp = totRevEng > 0 ? (totRevEng/eps).toFixed(4) : '0';
      const ratings = [d.engagement.inputs.apple_rating, d.engagement.inputs.spotify_rating].filter(r=>r!=null&&r>0);
      const avgRat = ratings.length > 0 ? (ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(2) : 'null';

      push(`  reviews_per_episode_ratio:`);
      push(`    raw:    (${d.engagement.inputs.apple_rating_count??0} apple + ${d.engagement.inputs.spotify_review_count??0} spotify) / ${eps} episodes = ${revPerEp} reviews/ep`);
      push(`    formula: log10(${revPerEp}+1) / log10(maxRatio=${n?.maxRatio!=null?r2(n.maxRatio):'?'}+1)`);
      push(`    ratio:  ${r2(d.engagement.ratios.rp)}`);
      push(`    original weight: 0.40${d.engagement.ratios.rp===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[0].effectiveWeight)}`}`);
      blank();

      push(`  rating_ratio:`);
      push(`    raw:    apple=${d.engagement.inputs.apple_rating??'null'}/5 | spotify=${d.engagement.inputs.spotify_rating??'null'}/5`);
      push(`    formula: avg(${avgRat}) / 5`);
      push(`    ratio:  ${r2(d.engagement.ratios.ra)}`);
      push(`    original weight: 0.60${d.engagement.ratios.ra===null?'  → NULL: weight redistributed':`  → effective: ${r2(ew[1].effectiveWeight)}`}`);
      blank();

      if (nullSigs.length > 0) {
        push(`  NULL redistribution:`);
        push(`    Null signals: [${nullSigs.map(s=>s.name).join(', ')}] donated weight`);
        push(`    Total valid weight used as denominator: ${totalValidW.toFixed(2)}`);
        blank();
      }

      const engMiss = (feed.score_missing_signals||[]).filter(s=>['reviews_per_episode','apple_rating/spotify_rating'].includes(s));
      push(`  missing signals: [${engMiss.join(', ')||'none'}]`);
      const engFormula = validSigs.map(s=>`${r2(s.value)}×${r2(s.effectiveWeight)}`).join(' + ');
      push(`  sub-score formula: ${engFormula||'all null → 0.5 neutral'} = **${d.engagement.score.toFixed(2)}/100**`);
    }
    blank();

    // ── CONTACTABILITY ───────────────────────────────────────
    push('**CONTACTABILITY (weight: 10%)**');
    blank();
    {
      const emailVal  = d.contact.inputs.email;
      const socialCnt = [
        d.contact.inputs.website_instagram, d.contact.inputs.website_twitter,
        d.contact.inputs.website_linkedin,  d.contact.inputs.website_youtube,
        d.contact.inputs.website_spotify,   d.contact.inputs.website_facebook,
      ].filter(Boolean).length;

      push(`  email_quality_ratio:`);
      push(`    raw:    "${emailVal??'null'}"`);
      push(`    type:   ${emailType(emailVal)}`);
      push(`    ratio:  ${r2(d.contact.ratios.eq)}  (note: absent=0 not null — does NOT redistribute weight)`);
      push(`    weight: 0.60 (always present — email absence is informative, scores 0)`);
      blank();

      push(`  contact_richness_ratio:`);
      push(`    raw:    email=${emailVal?1:0} | instagram=${d.contact.inputs.website_instagram?1:0} | twitter=${d.contact.inputs.website_twitter?1:0}`);
      push(`           linkedin=${d.contact.inputs.website_linkedin?1:0} | youtube=${d.contact.inputs.website_youtube?1:0} | spotify=${d.contact.inputs.website_spotify?1:0} | facebook=${d.contact.inputs.website_facebook?1:0}`);
      push(`    formula: (${emailVal?1:0} + ${socialCnt}×0.15) / 1.9 = (${emailVal?1:0}+${(socialCnt*0.15).toFixed(2)}) / 1.9`);
      push(`    ratio:  ${r2(d.contact.ratios.rc)}`);
      push(`    weight: 0.40 (always present)`);
      blank();

      const conMiss = (feed.score_missing_signals||[]).filter(s=>s==='email');
      push(`  missing signals: [${conMiss.join(', ')||'none'}]  (note: no null redistribution — both signals always computable)`);
      push(`  sub-score formula: ${r2(d.contact.ratios.eq)}×0.60 + ${r2(d.contact.ratios.rc)}×0.40 = **${d.contact.score.toFixed(2)}/100**`);
    }
    blank();

    // ── FINAL SCORE ──────────────────────────────────────────
    push('**FINAL SCORE CALCULATION:**');
    push('```');
    push(`guest_compatibility  × 0.20 = ${d.guest.score.toFixed(4)} × 0.20 = ${(d.guest.score*0.20).toFixed(4)}`);
    push(`audience_power       × 0.25 = ${d.audience.score.toFixed(4)} × 0.25 = ${(d.audience.score*0.25).toFixed(4)}`);
    push(`podcast_authority    × 0.15 = ${d.authority.score.toFixed(4)} × 0.15 = ${(d.authority.score*0.15).toFixed(4)}`);
    push(`activity_consistency × 0.20 = ${d.activity.score.toFixed(4)} × 0.20 = ${(d.activity.score*0.20).toFixed(4)}`);
    push(`engagement           × 0.10 = ${d.engagement.score.toFixed(4)} × 0.10 = ${(d.engagement.score*0.10).toFixed(4)}`);
    push(`contactability       × 0.10 = ${d.contact.score.toFixed(4)} × 0.10 = ${(d.contact.score*0.10).toFixed(4)}`);
    push(`─────────────────────────────────────────────────────────────────────────`);
    const rawSum = d.guest.score*0.20 + d.audience.score*0.25 + d.authority.score*0.15 +
                   d.activity.score*0.20 + d.engagement.score*0.10 + d.contact.score*0.10;
    push(`SUM = ${rawSum.toFixed(4)} → rounded → BADASSERY SCORE: ${feed.ai_badassery_score}/100`);
    push('```');
    blank();
    push(`Global percentile: **${feed.ai_global_percentile}th** | Category (${feed.ai_primary_category??'—'}): **${feed.ai_category_percentile}th**`);
    blank();

    // ── DATA COMPLETENESS CARD ────────────────────────────────
    push('```');
    dataCompletenessCard(feed).forEach(l => push(l));
    push('```');
    blank();
    hr();
    blank();
  }

  // ═══════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════
  push('## FINAL SUMMARY');
  blank();
  push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  blank();
  push('**PIPELINE RESULTS**');
  const drawMode = runConfig.RANDOM ? 'random draw' : 'ORDER BY popularityScore';
  push(`  Phase 1 → **${feeds.length}** podcasts (${drawMode})`);
  const p3bPassedCnt = feeds.filter(f=>f.gemini_guest_friendly===true).length;
  push(`  Phase 3b → **${p3bPassedCnt}/${feeds.length}** passed guest-friendly filter`);
  const allDropped = feeds.filter(f=>f._drop);
  if (allDropped.length > 0) {
    push(`  Dropped:`);
    allDropped.forEach(f => push(`    - ${f.title} → ${f._drop}`));
  }
  push(`  Phase 4 → **${enriched.length}** enriched`);
  push(`  Phase 5 → **${enriched.filter(f=>f.aiCategorizationStatus==='completed').length}/${enriched.length}** scored by Gemini`);
  push(`  Phase 6 → **${scored.length}** Badassery scores computed`);
  blank();

  push('**FINAL SCORES**');
  push('| # | title | guest | audience | authority | activity | engagement | contact | SCORE | pct |');
  push('|---|-------|-------|----------|-----------|----------|------------|---------|-------|-----|');
  enriched.forEach((feed, i) => {
    const s = (n, d=1) => n!=null ? n.toFixed(d) : '—';
    push(
      `| ${i+1} | ${(feed.title||'').slice(0,25)} | ${s(feed.score_guest_compatibility)} | ` +
      `${s(feed.score_audience_power)} | ${s(feed.score_podcast_authority)} | ` +
      `${s(feed.score_activity_consistency)} | ${s(feed.score_engagement)} | ` +
      `${s(feed.score_contactability)} | ` +
      `**${feed.ai_badassery_score!=null ? feed.ai_badassery_score.toFixed(2) : '—'}** | ` +
      `${feed.ai_global_percentile!=null ? feed.ai_global_percentile+'th' : '—'} |`
    );
  });
  blank();

  if (scored.length > 0) {
    const vals = scored.map(f=>f.ai_badassery_score).sort((a,b)=>a-b);
    const avg  = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100;
    const mid  = vals.length%2===0
      ? (vals[vals.length/2-1]+vals[vals.length/2])/2
      : vals[Math.floor(vals.length/2)];
    push(`Score distribution:  min: ${vals[0]} | max: ${vals[vals.length-1]} | avg: ${avg} | median: ${Math.round(mid*100)/100}`);
    blank();
  }

  // Guest authority verification table
  if (enriched.length > 0) {
    push('**GUEST AUTHORITY — FORMULA VERIFICATION**');
    push('| podcast | guests_identified | roles | authority_ratio | method |');
    push('|---------|-------------------|-------|-----------------|--------|');
    enriched.forEach(feed => {
      const guests = feed.gemini_recent_guests || [];
      const gA = feed._score_debug?.guest?.ratios?.gA;
      const roles = guests.length > 0
        ? [...new Set(guests.map(g => g.guest_role))].join(', ')
        : (feed.gemini_guest_authority || '—');
      const method = guests.length > 0 ? 'role-based ✅' : 'legacy fallback';
      push(`| ${(feed.title||'').slice(0,25)} | ${guests.length} | ${roles} | ${gA!=null?gA.toFixed(3):'—'} | ${method} |`);
    });
    blank();
  }

  // Data completeness overview
  if (enriched.length > 0) {
    push('**DATA COMPLETENESS OVERVIEW**');
    push('| podcast | scoring | webapp | outreach | overall | missing_signals |');
    push('|---------|---------|--------|----------|---------|-----------------|');
    enriched.forEach(feed => {
      const sc = [
        feed.gemini_guest_ratio != null,
        feed.gemini_guest_authority != null || (feed.gemini_recent_guests && feed.gemini_recent_guests.length > 0),
        feed.avg_episode_length_min != null, feed.apple_rating != null, feed.apple_rating_count != null,
        feed.spotify_rating != null, feed.spotify_review_count != null, feed.apple_chart_rank != null,
        feed.spotify_chart_rank != null, feed.yt_subscribers != null, feed.yt_avg_views_per_video != null,
        feed.instagram_followers != null, feed.oldestItemPubdate != null,
        (feed.newestItemPubdate || feed.lastUpdate) != null, feed.publish_consistency != null, feed.episodeCount != null,
      ].filter(Boolean).length;
      const wa = [
        feed.title, feed.description, feed.imageUrl, feed.ai_summary, feed.ai_primary_category,
        feed.ai_secondary_categories?.length, feed.ai_topics?.length, feed.ai_target_audience,
        feed.ai_audience_size, feed.ai_engagement_level, feed.itunesId, feed.newestItemPubdate, feed.avg_episode_length_min != null,
      ].filter(Boolean).length;
      const or = [
        feed.rss_owner_email, feed.website_email, feed.website_twitter, feed.website_linkedin,
        feed.website_instagram, feed.website_youtube, feed.website_spotify, feed.website_facebook, feed.website_tiktok,
      ].filter(Boolean).length;
      const total = 16+13+9;
      const missing = (feed.score_missing_signals||[]).join(', ') || 'none';
      push(`| ${(feed.title||'').slice(0,20)} | ${sc}/16 | ${wa}/13 | ${or}/9 | ${sc+wa+or}/${total} | ${missing} |`);
    });
    blank();
  }

  // Social / enrichment coverage
  if (enriched.length > 0) {
    const n = enriched.length;
    const cnt = (pred) => enriched.filter(pred).length;
    push('**SOCIAL/ENRICHMENT COVERAGE**');
    push(`  Apple rating found:          ${cnt(f=>f.apple_rating!=null)}/${n} (${Math.round(cnt(f=>f.apple_rating!=null)/n*100)}%)`);
    push(`  Spotify rating found:        ${cnt(f=>f.spotify_rating!=null)}/${n} (${Math.round(cnt(f=>f.spotify_rating!=null)/n*100)}%)`);
    push(`  YouTube found & validated:   ${cnt(f=>f.website_youtube)}/${n} (${Math.round(cnt(f=>f.website_youtube)/n*100)}%)`);
    push(`  Instagram found & validated: ${cnt(f=>f.website_instagram)}/${n} (${Math.round(cnt(f=>f.website_instagram)/n*100)}%)`);
    push(`  Chart rank (any):            ${cnt(f=>f.apple_chart_rank||f.spotify_chart_rank)}/${n} (${Math.round(cnt(f=>f.apple_chart_rank||f.spotify_chart_rank)/n*100)}%)`);
    push(`  Email found:                 ${cnt(f=>f.rss_owner_email||f.website_email)}/${n} (${Math.round(cnt(f=>f.rss_owner_email||f.website_email)/n*100)}%)`);
    blank();
  }

  // Rejected social accounts
  const rejections = [];
  for (const f of enriched) {
    if (f._rejected_youtube_channel) rejections.push(`  ${(f.title||'').slice(0,25)} → youtube: ${f.website_youtube||'(URL extracted by P4a)'} rejected — guest channel: "${f._rejected_youtube_channel}"`);
    if (f._rejected_instagram) rejections.push(`  ${(f.title||'').slice(0,25)} → instagram: ${f._rejected_instagram} rejected — no name match`);
    if (f._rejected_twitter)   rejections.push(`  ${(f.title||'').slice(0,25)} → twitter: ${f._rejected_twitter} rejected — no name match`);
    if (f._rejected_tiktok)    rejections.push(`  ${(f.title||'').slice(0,25)} → tiktok: ${f._rejected_tiktok} rejected — no name match`);
  }
  if (rejections.length > 0) {
    push('**REJECTED SOCIAL ACCOUNTS (guest confusion)**');
    rejections.forEach(r => push(r));
    blank();
  }

  // Missing signals summary
  if (scored.length > 0) {
    const missCounts = {};
    for (const f of scored) {
      for (const s of (f.score_missing_signals||[])) {
        missCounts[s] = (missCounts[s]||0) + 1;
      }
    }
    if (Object.keys(missCounts).length > 0) {
      push('**MISSING SIGNALS ACROSS ALL SCORED PODCASTS**');
      Object.entries(missCounts)
        .sort((a,b)=>b[1]-a[1])
        .forEach(([sig,cnt]) => push(`  ${sig}: ${cnt}/${scored.length} missing`));
      blank();
    }
  }

  // Anomalies
  const anomalies = [];
  for (const f of feeds) {
    if (f.aiCategorizationStatus === 'failed') anomalies.push(`  Phase 5 failed for: ${f.title}`);
    if (f._score_debug?.guest?.ratios?.gA === null) anomalies.push(`  guest_authority null for: ${f.title}`);
  }
  if (anomalies.length > 0) {
    push('**ANOMALIES DETECTED**');
    anomalies.forEach(a => push(a));
    blank();
  }

  // Verdict
  const phase5Failed = enriched.filter(f=>f.aiCategorizationStatus==='failed').length;
  const nullScores   = enriched.filter(f=>f.ai_badassery_score==null).length;
  push('**VERDICT**');
  if (phase5Failed === 0 && nullScores === 0) {
    push('  ✅ Pipeline ready for Phase 7');
  } else {
    push('  ⚠️  Issues found:');
    if (phase5Failed > 0) push(`    - ${phase5Failed} podcast(s) failed Phase 5 scoring`);
    if (nullScores > 0)   push(`    - ${nullScores} podcast(s) have null Badassery Score`);
  }

  blank();
  hr();
  push('*Report generated by Brooklyn Intelligence pipeline v1.0*');

  return L.join('\n');
}

module.exports = { generateReport };
