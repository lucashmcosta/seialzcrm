import { test, expect } from 'bun:test';
import { mergeSetups, socialSetupNotices, type SocialSetup } from '../src/pages/social/socialSetup';

const ok: SocialSetup = { has_page: true, has_instagram: true, has_messenger_permission: true, receiving: true };

test('nothing to explain when everything is connected', () => {
  expect(socialSetupNotices(ok)).toEqual([]);
  expect(socialSetupNotices({ ...ok, receiving: null })).toEqual([]);
});
test('each gap gets its own notice', () => {
  expect(socialSetupNotices({ ...ok, has_instagram: false })[0]).toContain('Instagram');
  expect(socialSetupNotices({ ...ok, has_messenger_permission: false })[0]).toContain('Messenger');
  expect(socialSetupNotices({ ...ok, receiving: false })[0]).toContain('recebimento');
});
test('no page is handled by the empty state, not by notices', () => {
  expect(socialSetupNotices({ ...ok, has_page: false, has_instagram: false })).toEqual([]);
  expect(socialSetupNotices(null)).toEqual([]);
});
test('a failed subscription in either query wins', () => {
  expect(mergeSetups([ok, { ...ok, receiving: false }])?.receiving).toBe(false);
  expect(mergeSetups([undefined, ok])).toEqual(ok);
  expect(mergeSetups([undefined, null])).toBeNull();
});
