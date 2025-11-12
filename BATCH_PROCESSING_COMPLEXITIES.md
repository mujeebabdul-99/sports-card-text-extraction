# Batch Processing Feature - Complexities to Handle

## Overview
This document outlines all the complexities and challenges that need to be addressed when implementing the multi-file batch processing feature.

---

## Core Complexities

### 1. **API Rate Limiting & Throttling**
- **Google Vision API**: ~1800 requests/minute limit
- **Gemini API**: Rate limits vary by model/tier
- **Problem**: Processing 50+ cards quickly can hit limits
- **Solution Needed**: Sequential processing with delays, exponential backoff, request tracking

### 2. **Memory Management**
- **Browser Memory**: Large batches (50+ images) can cause crashes
- **Backend Memory**: Storing all card data in memory (current Map-based storage)
- **Problem**: Memory leaks, browser slowdowns, server crashes
- **Solution Needed**: Process in chunks, clear processed data, pagination

### 3. **State Persistence & Recovery**
- **Browser Refresh**: User closes tab or refreshes during processing
- **Session Storage Limits**: ~5-10MB limit, can fill up
- **Problem**: Lost progress, need to restart entire batch
- **Solution Needed**: Save queue state, resume capability, handle storage overflow

### 4. **Error Handling & Partial Failures**
- **Network Failures**: Intermittent connectivity during long batches
- **API Errors**: Some cards fail, others succeed
- **Invalid Images**: Corrupted files, wrong format
- **Problem**: One failure shouldn't stop entire batch, need granular error tracking
- **Solution Needed**: Per-card error tracking, retry mechanism, continue on failure

### 5. **Long-Running Operations**
- **Timeout Risks**: Browser/server timeouts for long batches
- **User Experience**: User waits 10+ minutes for 50 cards
- **Problem**: Timeouts, poor UX, no feedback
- **Solution Needed**: Progress tracking, keep-alive mechanisms, background processing

### 6. **Export Complexity**
- **Google Sheets API Limits**: 1000 rows per batch request
- **Large CSV Files**: Browser download limits, memory issues
- **Partial Exports**: Some cards succeed, some fail
- **Problem**: Export failures, incomplete data, performance issues
- **Solution Needed**: Batch chunking for Sheets, streaming for large CSVs, error reporting

### 7. **Concurrent Processing Conflicts**
- **Multiple Tabs**: User opens same batch in multiple tabs
- **Duplicate Processing**: Same card processed twice
- **Problem**: Wasted API calls, duplicate data, race conditions
- **Solution Needed**: Request deduplication, locking mechanism, unique identifiers

### 8. **File Validation & Size Limits**
- **File Size**: Large images (10MB+) slow processing
- **File Types**: Non-image files, corrupted files
- **File Count**: Browser limits on file input (varies by browser)
- **Problem**: Invalid files break processing, large files timeout
- **Solution Needed**: Pre-upload validation, file size limits, type checking

### 9. **UI Performance with Large Batches**
- **Rendering**: 100+ rows in review table causes lag
- **Real-time Updates**: Updating UI for each card slows browser
- **Problem**: Frozen UI, poor user experience
- **Solution Needed**: Virtual scrolling, pagination, debounced updates, lazy loading

### 10. **Data Consistency**
- **In-Memory Storage**: Current Map-based storage lost on server restart
- **Card Relationships**: Linking cards to batches
- **Problem**: Data loss, no persistence, can't track batches
- **Solution Needed**: Database or persistent storage, batch tracking, relationships

### 11. **Progress Tracking Accuracy**
- **Network Delays**: Progress updates may lag
- **Failed Retries**: Progress bar may go backwards
- **Problem**: Inaccurate progress, confusing UX
- **Solution Needed**: Accurate state tracking, optimistic updates with rollback

### 12. **Browser Compatibility**
- **File API**: Different browsers handle FileList differently
- **Drag & Drop**: Mobile browsers have limited support
- **Storage**: localStorage/sessionStorage limits vary
- **Problem**: Feature breaks on some browsers/devices
- **Solution Needed**: Polyfills, fallbacks, browser detection

### 13. **Cost Management**
- **API Costs**: Each card = Vision API + Gemini API calls
- **Large Batches**: 100 cards = 200 API calls = significant cost
- **Problem**: Unexpected costs, no budget controls
- **Solution Needed**: Cost tracking, batch size limits, user warnings

### 14. **Queue Management**
- **Order Preservation**: Process cards in upload order
- **Priority Handling**: User wants to prioritize certain cards
- **Cancellation**: User wants to stop processing mid-batch
- **Problem**: No control over processing order, can't cancel
- **Solution Needed**: Queue manipulation, cancellation tokens, priority system

### 15. **Export Format Consistency**
- **Field Mapping**: All cards must have same CSV structure
- **Missing Data**: Some cards missing fields (empty cells)
- **Date Formatting**: Consistent date/time formats
- **Problem**: Inconsistent exports, broken imports
- **Solution Needed**: Standardized schema, default values, format validation

---

## Priority Ranking

### 🔴 **Critical (Must Handle)**
1. API Rate Limiting
2. Error Handling & Partial Failures
3. State Persistence & Recovery
4. Memory Management

### 🟡 **Important (Should Handle)**
5. Long-Running Operations
6. Export Complexity
7. UI Performance
8. File Validation

### 🟢 **Nice-to-Have (Can Handle Later)**
9. Concurrent Processing Conflicts
10. Data Consistency (if moving to database)
11. Cost Management
12. Queue Management Features

---

## Biggest Risks

### 1. **API Rate Limits**
- **Risk**: Batch fails mid-way, wasted processing
- **Impact**: High - User frustration, lost time
- **Mitigation**: Implement delays, track requests, exponential backoff

### 2. **Browser Crashes**
- **Risk**: Large batches cause browser to crash
- **Impact**: High - Lost progress, user frustration
- **Mitigation**: Process in chunks, clear memory, pagination

### 3. **Lost Progress**
- **Risk**: Refresh/timeout loses all progress
- **Impact**: High - User has to restart entire batch
- **Mitigation**: Persist state, resume capability

### 4. **Export Failures**
- **Risk**: Export fails with no recovery
- **Impact**: Medium - Lost work, need to re-export
- **Mitigation**: Retry logic, partial export support

---

## Implementation Considerations

### Technical Decisions Needed

1. **Processing Strategy**
   - Sequential vs Parallel
   - Chunk size for processing
   - Delay between requests

2. **State Management**
   - Where to store queue (React state vs sessionStorage)
   - How to persist across refreshes
   - How to handle concurrent sessions

3. **Error Recovery**
   - Retry strategy (immediate vs manual)
   - How many retries before giving up
   - How to handle partial failures

4. **Export Strategy**
   - Batch size for Google Sheets
   - Streaming vs in-memory for CSV
   - How to handle export failures

5. **UI/UX Decisions**
   - How to show progress (progress bar, per-card status)
   - How to handle errors (inline vs modal)
   - How to allow editing during processing

---

## Testing Scenarios

### Must Test

1. **Small Batch (5-10 cards)**
   - Verify all cards process successfully
   - Check export works correctly

2. **Medium Batch (20-30 cards)**
   - Verify rate limiting doesn't break
   - Check memory usage stays reasonable
   - Verify progress tracking accuracy

3. **Large Batch (50+ cards)**
   - Verify no crashes or timeouts
   - Check export handles large datasets
   - Verify state persistence works

4. **Error Scenarios**
   - Network failure mid-batch
   - Invalid image file
   - API rate limit hit
   - Browser refresh during processing

5. **Edge Cases**
   - Empty batch
   - Single card batch
   - All cards fail
   - Partial success/failure

---

## Monitoring & Observability

### Metrics to Track

1. **Processing Metrics**
   - Average processing time per card
   - Success/failure rates
   - API call counts
   - Queue length

2. **Performance Metrics**
   - Memory usage
   - Browser performance
   - API response times
   - Export generation time

3. **Error Metrics**
   - Error types and frequencies
   - Retry success rates
   - Recovery success rates

---

## Notes

- This list should be reviewed and updated as implementation progresses
- Some complexities may be discovered during development
- Priority rankings may shift based on user feedback
- Consider MVP approach: handle critical items first, iterate on others

