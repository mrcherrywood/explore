type LeaderboardEntry = {
  rank: number;
  entityLabel: string;
  valueLabel: string;
};

async function main() {
  console.log('🔍 Testing leaderboard API...\n');

  const payload = {
    mode: 'contract',
    selection: {
      stateOption: 'all',
      planTypeGroup: 'ALL',
      enrollmentLevel: 'all',
      topLimit: 10
    },
    includeMeasures: false
  };

  const response = await fetch('http://localhost:3000/api/leaderboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error('❌ API error:', response.status, response.statusText);
    const text = await response.text();
    console.error('Response:', text);
    return;
  }

  const data = await response.json();
  
  console.log('✅ API Response:');
  console.log('  Mode:', data.mode);
  console.log('  Data Year:', data.dataYear);
  console.log('  Prior Year:', data.priorYear);
  console.log('  Sections:', data.sections?.length || 0);
  
  if (data.sections && data.sections.length > 0) {
    const overallSection = data.sections[0];
    console.log('\nOverall Star Rating Section:');
    console.log('  Top Performers:', overallSection.topPerformers?.length || 0);
    console.log('  Biggest Movers:', overallSection.biggestMovers?.length || 0);
    console.log('  Biggest Decliners:', overallSection.biggestDecliners?.length || 0);
    
    const topPerformers = (overallSection.topPerformers ?? []) as LeaderboardEntry[];
    if (topPerformers.length > 0) {
      console.log('\nSample Top Performers:');
      topPerformers.slice(0, 5).forEach((entry) => {
        console.log(`  ${entry.rank}. ${entry.entityLabel} - ${entry.valueLabel}`);
      });
    }
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
