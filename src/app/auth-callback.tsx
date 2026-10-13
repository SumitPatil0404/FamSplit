import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Google sign-in returns to the app through a link to this address. The sign-in code reads the
 * link itself, so this screen has nothing to show: it steps straight back to where the person was.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  return null;
}
