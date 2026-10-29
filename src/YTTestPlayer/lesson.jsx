// app/lesson.jsx  (expo-router screen ekak - example)
import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import LessonVideo from "../components/LessonVideo";

export default function LessonScreen() {
  const [full, setFull] = useState(false);

  return (
    <View style={styles.screen}>
      {/* Fullscreen weddi header eka hangana */}
      <Stack.Screen options={{ headerShown: !full, title: "Lesson 01" }} />

      <LessonVideo
        url="https://www.youtube.com/playlist?list=PLOfumqay9m8j57AKqVnDdTDuQzknco1kQ"
        onFullscreenChange={setFull}
        onStatus={(status, message) => console.log("[video]", status, message)}
      />

      {!full && (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.h}>Lesson 01</Text>
          <Text style={styles.p}>Lesson notes, attachments, quiz links methana danna.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b1220" },
  body: { padding: 16, gap: 8 },
  h: { color: "#fff", fontSize: 20, fontWeight: "700" },
  p: { color: "#c7d0e0", fontSize: 15, lineHeight: 22 },
});
