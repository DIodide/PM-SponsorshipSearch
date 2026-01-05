# Data Sources for Sports Team Database

This document outlines the data sources and methodology for populating the sponsorship search database.

## Overview

The database requires comprehensive data on professional and minor league sports teams, including:
- Team demographics
- Fan base characteristics
- Sponsorship pricing
- Brand value alignment
- Geographic information

## Primary Data Sources

### 1. Official League Sources
- **NFL**: [nfl.com](https://www.nfl.com) - Team rosters, attendance data
- **NBA**: [nba.com](https://www.nba.com) - Team statistics, market data
- **MLB**: [mlb.com](https://www.mlb.com) - Attendance records, franchise history
- **NHL**: [nhl.com](https://www.nhl.com) - Team information, arena data
- **MLS**: [mlssoccer.com](https://www.mlssoccer.com) - Club profiles
- **USL**: [uslsoccer.com](https://www.uslsoccer.com) - Minor league soccer teams
- **WNBA**: [wnba.com](https://www.wnba.com) - Women's basketball teams

### 2. Demographic Data Sources
- **Nielsen Sports**: Fan demographic profiles, media consumption data
- **Scarborough Research**: Local market sports affinity data
- **U.S. Census Bureau**: Regional demographic data by market
- **Sports Business Journal**: Industry insights and market analysis

### 3. Sponsorship Data Sources
- **IEG Sponsorship Report**: Sponsorship spending trends
- **Sponsor United**: Deal tracking and pricing benchmarks
- **Sports Business Daily**: Industry news and deal announcements
- **Team Annual Reports**: For publicly traded teams (e.g., Manchester United)

### 4. Social Media & Engagement
- **Twitter/X API**: Follower counts, engagement metrics
- **Instagram**: Following and engagement rates
- **Facebook**: Page likes and community size

## Data Collection Methodology

### Phase 1: Core Team Data
1. Compile list of all teams by league
2. Extract basic information (name, city, venue, founding year)
3. Map teams to geographic regions

### Phase 2: Demographic Profiling
1. Cross-reference fan demographic studies
2. Estimate audience age, gender, income distributions
3. Identify primary audience segments

### Phase 3: Sponsorship Pricing
1. Research publicly available sponsorship deals
2. Apply market-size multipliers
3. Create estimated ranges based on comparable deals

### Phase 4: Brand Values Mapping
1. Analyze team messaging and positioning
2. Review community involvement programs
3. Assess brand identity through content analysis

## Data Quality Guidelines

### Required Fields (Must Have)
- Team name
- League
- City/State
- Region
- Market size

### Recommended Fields (Should Have)
- Demographics (avgAge, genderSplit, incomeLevel)
- Brand values (at least 3)
- Estimated sponsorship range
- Social following

### Optional Fields (Nice to Have)
- Founded year
- Venue name
- Average attendance
- Website URL
- Logo URL

## Data Refresh Schedule

| Data Type | Refresh Frequency |
|-----------|-------------------|
| Core team info | Annually |
| Demographics | Bi-annually |
| Sponsorship pricing | Quarterly |
| Social following | Monthly |
| Attendance data | End of season |

## Legal Considerations

1. **Public Data Only**: Only collect publicly available information
2. **Terms of Service**: Respect robots.txt and API terms
3. **Rate Limiting**: Implement delays between requests
4. **Attribution**: Cite sources where required
5. **No PII**: Do not collect personal fan information

## Scraping Best Practices

```typescript
// Example rate limiting
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function scrapeTeamData(url: string) {
  // Respect rate limits
  await delay(1000);
  
  // Check robots.txt
  const robotsUrl = new URL('/robots.txt', url).href;
  // ... validate allowed
  
  // Make request with proper User-Agent
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'PlayMaker-Research-Bot/1.0 (contact@playmaker.com)'
    }
  });
  
  return response;
}
```

## Future Enhancements

1. **AI-Powered Data Extraction**: Use LLMs to extract structured data from unstructured sources
2. **Real-Time Updates**: Integrate with sports data APIs for live updates
3. **Sentiment Analysis**: Monitor social media for brand perception
4. **Predictive Modeling**: Forecast sponsorship value based on team performance

## Contact

For questions about data sources or methodology, contact the PlayMaker data team.

