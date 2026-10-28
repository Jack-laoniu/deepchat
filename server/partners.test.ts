import { describe, expect, it } from 'vitest';
import { fillLink, partnerLinks } from './partners';

describe('booking links', () => {
  it('fill dates, guests and rooms from the travel pass', () => {
    const [hotels, tours] = partnerLinks({}, 'xian', 'en', { checkin: '2026-10-02', checkout: '2026-10-07', adults: 2, children: 1, rooms: 2 });
    expect(hotels.url).toBe("https://www.booking.com/searchresults.html?ss=Xi'an&checkin=2026-10-02&checkout=2026-10-07&group_adults=2&group_children=1&no_rooms=2");
    expect(tours.url).toBe("https://www.getyourguide.com/s/?q=Xi'an&date_from=2026-10-02&date_to=2026-10-07");
  });

  it('drop what is not known yet instead of sending empty parameters', () => {
    expect(fillLink('https://x.com/s?ss={city}&checkin={checkin}&group_adults={adults}', 'Beijing', { adults: 3 })).toBe('https://x.com/s?ss=Beijing&group_adults=3');
    expect(fillLink('https://x.com/s?checkin={checkin}&ss={city}', 'Beijing')).toBe('https://x.com/s?ss=Beijing');
    expect(fillLink('https://aff.link/abc', 'Beijing')).toBe('https://aff.link/abc');
  });
});
