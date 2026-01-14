import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { mavenApi } from './lib/api';

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface-lg">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded bg-error/10 flex items-center justify-center">
                    <svg className="h-5 w-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h1 className="text-lg font-semibold text-text-primary">Runtime Error</h1>
                </div>
                <p className="text-text-secondary text-sm mb-6 font-mono bg-surfaceHighlight p-3 rounded border border-border">
                  {this.state.error?.message || 'An unexpected error occurred'}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-amber hover:bg-amber/90 text-background font-medium py-2.5 px-4 rounded transition-colors"
                >
                  Reload Application
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="bg-error/5 border border-error/20 text-error px-4 py-3 rounded-lg flex items-start gap-3">
      <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex text-sm text-text-secondary mb-6 animate-fade-in">
      <ol className="flex items-center space-x-2 flex-wrap">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {item.href ? (
              <Link to={item.href} className="hover:text-amber transition-colors font-mono text-xs">
                {item.label}
              </Link>
            ) : (
              <span className="text-text-primary font-mono text-xs font-medium">{item.label}</span>
            )}
            {index < items.length - 1 && (
              <span className="mx-2 text-text-muted font-mono text-xs">/</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function UpButton({ to, label }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-xs bg-surfaceHighlight hover:bg-border hover:text-amber text-text-secondary px-3 py-1.5 rounded transition-all font-mono border border-border mb-6"
      title={`Go up to ${label || 'parent'}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
      Up
      {label && <span className="text-text-muted">· {label}</span>}
    </Link>
  );
}

function DependencySnippet({ groupId, artifactId, version }: {
  groupId: string;
  artifactId: string;
  version: string;
}) {
  const [copied, setCopied] = React.useState<'gradle' | 'maven' | null>(null);

  const gradleSnippet = `implementation("${groupId}:${artifactId}:${version}")`;
  const mavenSnippet = `<dependency>\n  <groupId>${groupId}</groupId>\n  <artifactId>${artifactId}</artifactId>\n  <version>${version}</version>\n</dependency>`;

  const copyToClipboard = (text: string, type: 'gradle' | 'maven') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mt-6 animate-stagger-3">
      <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <svg className="h-4 w-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Dependency Snippets
          </h3>
          <span className="text-xs text-text-muted font-mono">copy to clipboard</span>
        </div>
        <div className="divide-y divide-border">
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Gradle (Kotlin DSL)</span>
              <button
                onClick={() => copyToClipboard(gradleSnippet, 'gradle')}
                className="text-xs bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-text-primary px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-mono border border-border"
              >
                {copied === 'gradle' ? (
                  <>
                    <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-surfaceHighlight text-text-primary p-4 rounded text-sm overflow-x-auto font-mono border border-border/50 leading-relaxed">
              <code>
                <span className="syntax-keyword">implementation</span>
                <span className="syntax-punctuation">(</span>
                <span className="syntax-string">"{groupId}:{artifactId}:{version}"</span>
                <span className="syntax-punctuation">)</span>
              </code>
            </pre>
          </div>
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Maven</span>
              <button
                onClick={() => copyToClipboard(mavenSnippet, 'maven')}
                className="text-xs bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-text-primary px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-mono border border-border"
              >
                {copied === 'maven' ? (
                  <>
                    <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-surfaceHighlight text-text-primary p-4 rounded text-sm overflow-x-auto font-mono border border-border/50 leading-relaxed">
              <code>
                <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">dependency</span><span className="syntax-punctuation">&gt;</span>
                {'\n  '}
                <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">groupId</span><span className="syntax-punctuation">&gt;</span>
                <span className="syntax-string">{groupId}</span>
                <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">groupId</span><span className="syntax-punctuation">&gt;</span>
                {'\n  '}
                <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">artifactId</span><span className="syntax-punctuation">&gt;</span>
                <span className="syntax-string">{artifactId}</span>
                <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">artifactId</span><span className="syntax-punctuation">&gt;</span>
                {'\n  '}
                <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">version</span><span className="syntax-punctuation">&gt;</span>
                <span className="syntax-string">{version}</span>
                <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">version</span><span className="syntax-punctuation">&gt;</span>
                {'\n'}
                <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">dependency</span><span className="syntax-punctuation">&gt;</span>
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function RepositorySnippet() {
  const [copied, setCopied] = React.useState<'gradle' | 'gradle-groovy' | 'maven' | null>(null);
  const repoUrl = 'https://maven.kaf.sh/';

  const snippets = {
    gradle: `repositories {
    maven {
        url = uri("${repoUrl}")
    }
}`,
    'gradle-groovy': `repositories {
    maven { url '${repoUrl}' }
}`,
    maven: `<repository>
  <id>kaf-maven</id>
  <url>${repoUrl}</url>
</repository>`,
  };

  const copyToClipboard = (text: string, type: 'gradle' | 'gradle-groovy' | 'maven') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <svg className="h-4 w-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Add Repository
        </h3>
        <span className="text-xs text-text-muted font-mono">copy to build config</span>
      </div>
      <div className="divide-y divide-border">
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Gradle (Kotlin DSL)</span>
            <button
              onClick={() => copyToClipboard(snippets.gradle, 'gradle')}
              className="text-xs bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-text-primary px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-mono border border-border"
            >
              {copied === 'gradle' ? (
                <>
                  <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="bg-surfaceHighlight text-text-primary p-4 rounded text-sm overflow-x-auto font-mono border border-border/50 leading-relaxed">
            <code>
              <span className="syntax-keyword">repositories</span>
              <span className="syntax-punctuation"> {'{'}</span>
              {'\n    '}
              <span className="syntax-keyword">maven</span>
              <span className="syntax-punctuation"> {'{'}</span>
              {'\n        '}
              <span className="syntax-attr">url</span>
              <span className="syntax-punctuation"> = </span>
              <span className="syntax-keyword">uri</span>
              <span className="syntax-punctuation">(</span>
              <span className="syntax-string">"{repoUrl}"</span>
              <span className="syntax-punctuation">)</span>
              {'\n    '}
              <span className="syntax-punctuation">{'}'}</span>
              {'\n'}
              <span className="syntax-punctuation">{'}'}</span>
            </code>
          </pre>
        </div>
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Gradle (Groovy)</span>
            <button
              onClick={() => copyToClipboard(snippets['gradle-groovy'], 'gradle-groovy')}
              className="text-xs bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-text-primary px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-mono border border-border"
            >
              {copied === 'gradle-groovy' ? (
                <>
                  <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="bg-surfaceHighlight text-text-primary p-4 rounded text-sm overflow-x-auto font-mono border border-border/50 leading-relaxed">
            <code>
              <span className="syntax-keyword">repositories</span>
              <span className="syntax-punctuation"> {'{'}</span>
              {'\n    '}
              <span className="syntax-keyword">maven</span>
              <span className="syntax-punctuation"> {'{'} </span>
              <span className="syntax-attr">url</span>
              <span className="syntax-punctuation"> </span>
              <span className="syntax-string">'{repoUrl}'</span>
              <span className="syntax-punctuation"> </span>
              <span className="syntax-punctuation">{'}'}</span>
              {'\n'}
              <span className="syntax-punctuation">{'}'}</span>
            </code>
          </pre>
        </div>
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Maven (pom.xml)</span>
            <button
              onClick={() => copyToClipboard(snippets.maven, 'maven')}
              className="text-xs bg-surfaceHighlight hover:bg-surfaceHighlight/80 text-text-primary px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-mono border border-border"
            >
              {copied === 'maven' ? (
                <>
                  <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="bg-surfaceHighlight text-text-primary p-4 rounded text-sm overflow-x-auto font-mono border border-border/50 leading-relaxed">
            <code>
              <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">repository</span><span className="syntax-punctuation">&gt;</span>
              {'\n  '}
              <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">id</span><span className="syntax-punctuation">&gt;</span>
              <span className="syntax-string">kaf-maven</span>
              <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">id</span><span className="syntax-punctuation">&gt;</span>
              {'\n  '}
              <span className="syntax-punctuation">&lt;</span><span className="syntax-tag">url</span><span className="syntax-punctuation">&gt;</span>
              <span className="syntax-string">{repoUrl}</span>
              <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">url</span><span className="syntax-punctuation">&gt;</span>
              {'\n'}
              <span className="syntax-punctuation">&lt;/</span><span className="syntax-tag">repository</span><span className="syntax-punctuation">&gt;</span>
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ICONS
// ============================================================================

const FolderIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const CubeIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const TagIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const FileIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// ============================================================================
// PAGES
// ============================================================================

function HomePage() {
  const { data: groups, isLoading, error } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await mavenApi.getGroups();
      if (response.error) throw new Error(response.error);
      return response.data;
    },
  });

  if (error) return <ErrorMessage message={error.message} />;

  return (
    <div className="space-y-6">
      <div className="animate-stagger-1">
        <div className="flex items-baseline gap-4 mb-3">
          <h1 className="text-3xl font-bold text-text-primary font-mono">maven<span className="text-amber">.kaf.sh</span></h1>
          <span className="text-text-muted text-sm font-mono">~</span>
        </div>
        <p className="text-text-secondary">Browse artifacts for the Kaf maven</p>
      </div>

      <div className="animate-stagger-2">
        <RepositorySnippet />
      </div>

      <div className="animate-stagger-3">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
              <div className="h-4 bg-surfaceHighlight rounded w-20 animate-pulse" />
            </div>
            <ul className="divide-y divide-border">
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                  <div className="h-4 bg-surfaceHighlight rounded w-32" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                  <div className="h-4 bg-surfaceHighlight rounded w-40" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                  <div className="h-4 bg-surfaceHighlight rounded w-28" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                  <div className="h-4 bg-surfaceHighlight rounded w-36" />
                </div>
              </li>
              <li className="px-5 py-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                  <div className="h-4 bg-surfaceHighlight rounded w-24" />
                </div>
              </li>
            </ul>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <svg className="h-4 w-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Groups
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {groups && groups.length > 0 ? (
                groups.map((group, index) => (
                  <li
                    key={group}
                    className="px-5 py-3 card-hover group animate-stagger-4"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <Link
                      to={`/group/${group}`}
                      className="flex items-center gap-3 text-text-secondary group-hover:text-amber transition-colors font-mono text-sm"
                    >
                      <span className="text-text-tertiary group-hover:text-amber/70 transition-colors">
                        <FolderIcon />
                      </span>
                      <span className="group-hover:translate-x-1 transition-transform">{group}</span>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-5 py-8 text-center text-text-muted text-sm">No groups found</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();

  const { data: items, isLoading, error } = useQuery({
    queryKey: ['artifacts', groupId],
    queryFn: async () => {
      const response = await mavenApi.getArtifacts(groupId!);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!groupId,
  });

  if (error) return <ErrorMessage message={error.message} />;

  // Calculate parent group (e.g., "com.iamkaf.amber" -> "com.iamkaf")
  const parentGroup = groupId?.includes('.')
    ? groupId.substring(0, groupId.lastIndexOf('.'))
    : null;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'home', href: '/' },
        { label: groupId || '' }
      ]} />
      {parentGroup && <UpButton to={`/group/${parentGroup}`} label={parentGroup} />}

      <div className="animate-slide-up">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
              <div className="h-4 bg-surfaceHighlight rounded w-20 animate-pulse" />
            </div>
            <ul className="divide-y divide-border">
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="h-4 bg-surfaceHighlight rounded w-32" />
                  </div>
                  <div className="h-5 bg-surfaceHighlight rounded w-16" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="h-4 bg-surfaceHighlight rounded w-40" />
                  </div>
                  <div className="h-5 bg-surfaceHighlight rounded w-16" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="h-4 bg-surfaceHighlight rounded w-28" />
                  </div>
                  <div className="h-5 bg-surfaceHighlight rounded w-16" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="h-4 bg-surfaceHighlight rounded w-36" />
                  </div>
                  <div className="h-5 bg-surfaceHighlight rounded w-16" />
                </div>
              </li>
              <li className="px-5 py-3 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="h-4 bg-surfaceHighlight rounded w-24" />
                  </div>
                  <div className="h-5 bg-surfaceHighlight rounded w-16" />
                </div>
              </li>
            </ul>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <svg className="h-4 w-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Contents
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {items && items.length > 0 ? (
                items.map((item, index) => (
                  <li
                    key={item.name}
                    className="px-5 py-3 card-hover group"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <Link
                      to={item.isArtifact
                        ? `/artifact/${groupId}/${item.name}`
                        : `/group/${groupId}.${item.name}`
                      }
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 text-text-primary group-hover:text-amber transition-colors font-mono text-sm">
                        <span className={item.isArtifact ? "text-info/70" : "text-text-tertiary"}>
                          {item.isArtifact ? <CubeIcon /> : <FolderIcon />}
                        </span>
                        <span className="group-hover:translate-x-1 transition-transform">{item.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded font-medium border ${
                        item.isArtifact
                          ? 'bg-info/10 text-info border-info/20'
                          : 'bg-text-tertiary/10 text-text-muted border-text-tertiary/20'
                      }`}>
                        {item.isArtifact ? 'artifact' : 'group'}
                      </span>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-5 py-8 text-center text-text-muted text-sm">No artifacts found</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Semantic version comparison helper
// Handles versions with build metadata (e.g., "9.0.0+1.21.11")
// The + and everything after it is ignored for comparison (per semver spec)
function compareVersions(a: string, b: string): number {
  // Remove build metadata (everything after +)
  const versionA = a.split('+')[0];
  const versionB = b.split('+')[0];

  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

function ArtifactPage() {
  const { groupId, artifactId } = useParams<{ groupId: string; artifactId: string }>();
  const [sortDirection, setSortDirection] = React.useState<'desc' | 'asc'>('desc');

  const { data: versions, isLoading, error } = useQuery({
    queryKey: ['versions', groupId, artifactId],
    queryFn: async () => {
      const response = await mavenApi.getVersions(groupId!, artifactId!);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!(groupId && artifactId),
  });

  // Sort versions based on current direction
  const sortedVersions = React.useMemo(() => {
    if (!versions) return null;
    const sorted = [...versions].sort((a, b) => {
      return sortDirection === 'desc'
        ? compareVersions(b.version, a.version)
        : compareVersions(a.version, b.version);
    });
    return sorted;
  }, [versions, sortDirection]);

  if (error) return <ErrorMessage message={error.message} />;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'home', href: '/' },
        { label: groupId || '', href: `/group/${groupId}` },
        { label: artifactId || '' }
      ]} />
      <UpButton to={`/group/${groupId}`} label={groupId} />

      <div className="animate-slide-up">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50 flex items-center justify-between">
              <div className="h-4 bg-surfaceHighlight rounded w-20 animate-pulse" />
              <div className="h-6 bg-surfaceHighlight rounded w-16 animate-pulse" />
            </div>
            <ul className="divide-y divide-border">
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-surfaceHighlight rounded w-24" />
                  <div className="flex items-center gap-2">
                    <div className="h-5 bg-surfaceHighlight rounded w-12" />
                    <div className="h-5 bg-surfaceHighlight rounded w-16" />
                  </div>
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-surfaceHighlight rounded w-28" />
                  <div className="flex items-center gap-2">
                    <div className="h-5 bg-surfaceHighlight rounded w-12" />
                    <div className="h-5 bg-surfaceHighlight rounded w-16" />
                  </div>
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-surfaceHighlight rounded w-20" />
                  <div className="flex items-center gap-2">
                    <div className="h-5 bg-surfaceHighlight rounded w-12" />
                  </div>
                </div>
              </li>
              <li className="px-5 py-3 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-surfaceHighlight rounded w-32" />
                  <div className="flex items-center gap-2">
                    <div className="h-5 bg-surfaceHighlight rounded w-12" />
                    <div className="h-5 bg-surfaceHighlight rounded w-16" />
                  </div>
                </div>
              </li>
            </ul>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <TagIcon />
                Versions
              </h2>
              <button
                onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
                className="text-xs bg-surfaceHighlight hover:bg-border hover:text-amber text-text-primary px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-mono border border-border"
                title={`Currently: ${sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4l4 4" />
                </svg>
                {sortDirection === 'desc' ? 'Newest' : 'Oldest'}
              </button>
            </div>
            <ul className="divide-y divide-border">
              {sortedVersions && sortedVersions.length > 0 ? (
                sortedVersions.map(({ version, latest, release }, index) => (
                  <li
                    key={version}
                    className="px-5 py-3 card-hover group"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <Link
                      to={`/version/${groupId}/${artifactId}/${version}`}
                      className="flex items-center justify-between"
                    >
                      <span className="text-text-primary group-hover:text-amber transition-colors font-mono text-sm group-hover:translate-x-1 inline-block">
                        {version}
                      </span>
                      <div className="flex items-center gap-2">
                        {latest && (
                          <span className="text-xs px-2 py-1 rounded bg-success/10 text-success border border-success/20 font-medium flex items-center gap-1">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            latest
                          </span>
                        )}
                        {release && (
                          <span className="text-xs px-2 py-1 rounded bg-info/10 text-info border border-info/20 font-medium">
                            release
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-5 py-8 text-center text-text-muted text-sm">No versions found</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionPage() {
  const { groupId, artifactId, version } = useParams<{
    groupId: string;
    artifactId: string;
    version: string;
  }>();

  const { data: files, isLoading, error } = useQuery({
    queryKey: ['files', groupId, artifactId, version],
    queryFn: async () => {
      const response = await mavenApi.getFiles(groupId!, artifactId!, version!);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    enabled: !!(groupId && artifactId && version),
  });

  if (error) return <ErrorMessage message={error.message} />;

  const groupPath = groupId?.replace(/\./g, '/');
  const baseUrl = window.location.origin;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'home', href: '/' },
        { label: groupId || '', href: `/group/${groupId}` },
        { label: artifactId || '', href: `/artifact/${groupId}/${artifactId}` },
        { label: version || '' }
      ]} />
      <UpButton to={`/artifact/${groupId}/${artifactId}`} label={`${groupId}:${artifactId}`} />

      <DependencySnippet
        groupId={groupId || ''}
        artifactId={artifactId || ''}
        version={version || ''}
      />

      <div className="animate-slide-up">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
              <div className="h-4 bg-surfaceHighlight rounded w-20 animate-pulse" />
            </div>
            <ul className="divide-y divide-border">
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="flex-1">
                      <div className="h-4 bg-surfaceHighlight rounded w-40 mb-2" />
                      <div className="h-3 bg-surfaceHighlight rounded w-16" />
                    </div>
                  </div>
                  <div className="h-8 bg-surfaceHighlight rounded w-20" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="flex-1">
                      <div className="h-4 bg-surfaceHighlight rounded w-36 mb-2" />
                      <div className="h-3 bg-surfaceHighlight rounded w-20" />
                    </div>
                  </div>
                  <div className="h-8 bg-surfaceHighlight rounded w-20" />
                </div>
              </li>
              <li className="px-5 py-3 border-b border-border animate-pulse">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="flex-1">
                      <div className="h-4 bg-surfaceHighlight rounded w-48 mb-2" />
                      <div className="h-3 bg-surfaceHighlight rounded w-16" />
                    </div>
                  </div>
                  <div className="h-8 bg-surfaceHighlight rounded w-20" />
                </div>
              </li>
              <li className="px-5 py-3 animate-pulse">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-5 h-5 bg-surfaceHighlight rounded" />
                    <div className="flex-1">
                      <div className="h-4 bg-surfaceHighlight rounded w-44 mb-2" />
                      <div className="h-3 bg-surfaceHighlight rounded w-24" />
                    </div>
                  </div>
                  <div className="h-8 bg-surfaceHighlight rounded w-20" />
                </div>
              </li>
            </ul>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-surface">
            <div className="px-5 py-3 border-b border-border bg-surfaceHighlight/50">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
                <FileIcon />
                Files
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {files && files.length > 0 ? (
                files.map((file, index) => (
                  <li
                    key={file.name}
                    className="px-5 py-3 card-hover group"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-text-tertiary flex-shrink-0">
                          <FileIcon />
                        </span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={`${baseUrl}/${groupPath}/${artifactId}/${version}/${file.name}`}
                            className="text-text-primary group-hover:text-amber transition-colors font-mono text-sm block truncate"
                            download
                          >
                            {file.name}
                          </a>
                          <div className="text-xs text-text-muted mt-0.5 font-mono">
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                      </div>
                      <a
                        href={`${baseUrl}/${groupPath}/${artifactId}/${version}/${file.name}`}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm font-medium rounded text-text-primary bg-surfaceHighlight hover:bg-border hover:border-amber/50 transition-all group-hover:border-amber/30"
                        download
                      >
                        <DownloadIcon />
                        <span className="text-xs">Download</span>
                      </a>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-5 py-8 text-center text-text-muted text-sm">No files found</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// LAYOUT COMPONENTS
// ============================================================================

const AppBackground = React.memo(function AppBackground() {
  return (
    <>
      {/* Noise texture overlay */}
      <div className="noise-overlay" />
      {/* Grid pattern background */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-[0.3] pointer-events-none" />
    </>
  );
});

const Header = React.memo(function Header() {
  return (
    <header className="relative border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <Link to="/" className="inline-flex items-center gap-3 group">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-amber to-amber/80 flex items-center justify-center shadow-glow-sm">
            <span className="text-background font-bold text-sm font-mono">M</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary group-hover:text-amber transition-colors font-mono">
              maven<span className="text-amber">.kaf.sh</span>
            </h1>
            <p className="text-xs text-text-muted font-mono">artifact repository</p>
          </div>
        </Link>
      </div>
    </header>
  );
});

const Footer = React.memo(function Footer() {
  return (
    <footer className="relative border-t border-border bg-surface/50 mt-16">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <p className="font-mono">
            Maven Repository Platform · <span className="text-amber">Powered by Cloudflare</span>
          </p>
          <p className="font-mono text-text-tertiary">
            <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse mr-2"></span>
            operational
          </p>
        </div>
      </div>
    </footer>
  );
});

// ============================================================================
// APP
// ============================================================================

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-background relative">
          <AppBackground />
          <Header />
          <main className="relative max-w-5xl mx-auto px-6 py-10">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/group/:groupId" element={<GroupPage />} />
                <Route path="/artifact/:groupId/:artifactId" element={<ArtifactPage />} />
                <Route path="/version/:groupId/:artifactId/:version" element={<VersionPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
