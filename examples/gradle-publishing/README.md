# Gradle Maven Publishing Example

This example demonstrates how to publish Java libraries to the Maven repository using Gradle's `maven-publish` plugin with Groovy DSL.

## Prerequisites

1. **Configure credentials** in your `~/.gradle/gradle.properties`:

```properties
MAVEN_PUBLISH_USERNAME=maven
MAVEN_PUBLISH_PASSWORD=your-password-here
```

Or set them as environment variables:

```bash
export MAVEN_PUBLISH_USERNAME=maven
export MAVEN_PUBLISH_PASSWORD=your-password-here
```

2. **Build and publish**:

```bash
./gradlew publish
```

## Configuration

The key parts of `build.gradle`:

```groovy
plugins {
    id 'java'
    id 'maven-publish'
}

publishing {
    publications {
        maven(MavenPublication) {
            from components.java
        }
    }

    repositories {
        maven {
            name = 'maven-kaf-sh'
            // Use /releases for release versions, /snapshots for snapshot versions
            url = project.version.endsWith('-SNAPSHOT')
                ? 'https://z.kaf.sh/snapshots'
                : 'https://z.kaf.sh/releases'

            credentials {
                username = System.getenv('MAVEN_PUBLISH_USERNAME')
                password = System.getenv('MAVEN_PUBLISH_PASSWORD')
            }
        }
    }
}
```

## Security Notes

- **Never commit credentials** to version control
- Use environment variables in CI/CD pipelines
- Store secrets in your CI platform (GitHub Secrets, GitLab CI variables, etc.)
- Rotate credentials periodically

## CI/CD Example

GitHub Actions:

```yaml
name: Publish to Maven Repository

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Publish to Maven Repository
        env:
          MAVEN_PUBLISH_USERNAME: maven
          MAVEN_PUBLISH_PASSWORD: ${{ secrets.MAVEN_PUBLISH_PASSWORD }}
        run: ./gradlew publish
```

## Verification

After publishing, verify your artifacts are available:

```bash
# Check if artifact exists
curl -I https://maven.kaf.sh/com/iamkaf/example-library/1.0.0/example-library-1.0.0.jar

# Browse the repository
# https://z.kaf.sh
```
