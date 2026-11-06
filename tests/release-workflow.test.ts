// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
const job = (name: string) => workflow.split(new RegExp(`^  ${name}:$`, 'm'))[1]?.split(/^ {2}\w+:$/m)[0] ?? '';

/** The release pipeline's guarantees are one careless edit away, and CI can't test its own tag path. */
describe('release workflow', () => {
  it('pins every action to a full commit SHA', () => {
    const uses = [...workflow.matchAll(/^\s*- uses:\s*(.+)$/gm)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/^[\w./-]+@[0-9a-f]{40} # \S+/);
  });

  it('is read-only by default, with one job allowed to write', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(workflow.match(/contents: write/g)).toHaveLength(1);
    expect(job('release')).toContain('contents: write');
    expect(job('release')).not.toContain('id-token');
    expect(job('attest')).toContain('id-token: write');
  });

  it('runs no third-party action in the job that can write', () => {
    const actions = [...job('release').matchAll(/uses:\s*([\w-]+)\//g)].map((m) => m[1]);
    expect(actions.every((owner) => owner === 'actions')).toBe(true);
  });

  it('refuses a tag build without signing, before doing any work', () => {
    const steps = job('android').split('steps:')[1]!;
    expect(steps.trimStart().startsWith('- name: Refuse to release without signing')).toBe(true);
    expect(steps).toContain("startsWith(github.ref, 'refs/tags/v') && env.HAS_KEYSTORE != 'true'");
    expect(steps).toContain('apksigner" verify');
  });

  it('only publishes after the attestation', () => {
    expect(job('release')).toMatch(/needs: attest$/m);
    expect(job('attest')).toMatch(/needs: \[windows, android\]$/m);
  });

  it('builds from the committed lockfile and verifies the Gradle wrapper', () => {
    expect(workflow).toContain('npx tauri build --bundles nsis,msi -- --locked');
    expect(job('android')).toContain('gradle/actions/wrapper-validation@');
    expect(readFileSync('android/gradle/wrapper/gradle-wrapper.properties', 'utf8')).toMatch(/^distributionSha256Sum=[0-9a-f]{64}\r?$/m);
  });
});
